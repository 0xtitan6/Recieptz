use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, PanicOnDefault};

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq)]
pub enum Label {
    True,
    False,
    Misleading,
    Unverified,
    Contested,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq)]
pub enum Status {
    Pending,
    Verdict(Label),
    Abandoned,
    Late(Label),
}

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq)]
pub struct Run {
    pub id: String,
    pub claim_post_id: String,
    pub claim_hash: String,
    pub jury_config: String,
    pub registered_at_ms: u64,
    pub status: Status,
    pub receipt_cid: Option<String>,
    pub verdict_at_ms: Option<u64>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    triage: AccountId, // only account allowed to call register_claim
    jury: AccountId,   // only account allowed to call submit_verdict
    timeout_ms: u64,   // after this, a pending run counts as abandoned
    runs: LookupMap<String, Run>,                 // run_id → run
    runs_by_post: LookupMap<String, Vec<String>>, // claim_post_id → run_ids, oldest first
}

#[near]
impl Contract {
    #[init]
    pub fn new(triage: AccountId, jury: AccountId, timeout_ms: u64) -> Self {
        Self {
            triage,
            jury,
            timeout_ms,
            runs: LookupMap::new(b"r".to_vec()),
            runs_by_post: LookupMap::new(b"p".to_vec()),
        }
    }

    /// Commit a claim before any juror runs. Creates a Pending run.
    pub fn register_claim(
        &mut self,
        run_id: String,
        claim_post_id: String,
        claim_hash: String,
        jury_config: String,
    ) {
        require!(env::predecessor_account_id() == self.triage, "only triage can register claims");
        require!(!self.runs.contains_key(&run_id), "run_id already exists");

        let run = Run {
            id: run_id.clone(),
            claim_post_id: claim_post_id.clone(),
            claim_hash,
            jury_config,
            registered_at_ms: env::block_timestamp_ms(),
            status: Status::Pending,
            receipt_cid: None,
            verdict_at_ms: None,
        };
        self.runs.insert(run_id.clone(), run);

        let mut ids = self.runs_by_post.get(&claim_post_id).cloned().unwrap_or_default();
        ids.push(run_id);
        self.runs_by_post.insert(claim_post_id, ids);
    }

    /// Record the one verdict for a run. A verdict after the timeout is accepted but stored as Late.
    pub fn submit_verdict(&mut self, run_id: String, label: Label, receipt_cid: String) {
        require!(env::predecessor_account_id() == self.jury, "only jury can submit verdicts");
        let timeout_ms = self.timeout_ms;
        let run = self
            .runs
            .get_mut(&run_id)
            .unwrap_or_else(|| env::panic_str("run not found"));
        require!(run.status == Status::Pending, "verdict already exists for this run");

        let now = env::block_timestamp_ms();
        run.status = if now > run.registered_at_ms + timeout_ms {
            Status::Late(label)
        } else {
            Status::Verdict(label)
        };
        run.receipt_cid = Some(receipt_cid);
        run.verdict_at_ms = Some(now);
    }

    pub fn get_run(&self, run_id: String) -> Option<Run> {
        self.runs.get(&run_id).map(|r| self.with_current_status(r))
    }

    /// Every run for a post, including abandoned ones, oldest first.
    pub fn get_runs_by_post(&self, claim_post_id: String) -> Vec<Run> {
        self.runs_by_post
            .get(&claim_post_id)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.runs.get(id))
                    .map(|r| self.with_current_status(r))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn get_timeout_ms(&self) -> u64 {
        self.timeout_ms
    }
}

impl Contract {
    // Abandoned is never written to storage: a run is abandoned while it is still
    // Pending and its timeout has passed. A late verdict can still turn it into Late.
    fn with_current_status(&self, run: &Run) -> Run {
        let mut r = run.clone();
        if r.status == Status::Pending
            && env::block_timestamp_ms() > r.registered_at_ms + self.timeout_ms
        {
            r.status = Status::Abandoned;
        }
        r
    }
}

#[cfg(test)]
mod tests;
