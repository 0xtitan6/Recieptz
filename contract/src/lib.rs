use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, PanicOnDefault};

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Record {
    pub code: String,
    pub claim_hash: String,
    pub receipt_hash: String, // sha256 of the full receipt JSON stored off-chain
    pub verdict: String,
    pub confidence_bps: u16, // 0..10000
    pub timestamp_ms: u64,
    pub supersedes: Option<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    writer: AccountId, // the agent account; later, the Shade Agent
    receipts: LookupMap<String, Record>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(writer: AccountId) -> Self {
        Self { writer, receipts: LookupMap::new(b"r".to_vec()) }
    }

    pub fn write_receipt(
        &mut self,
        code: String,
        claim_hash: String,
        receipt_hash: String,
        verdict: String,
        confidence_bps: u16,
        supersedes: Option<String>,
    ) {
        assert_eq!(env::predecessor_account_id(), self.writer, "only the agent can write");
        assert!(!self.receipts.contains_key(&code), "code already exists");
        if let Some(prev) = &supersedes {
            assert!(self.receipts.contains_key(prev), "superseded receipt not found");
        }
        let rec = Record {
            code: code.clone(),
            claim_hash,
            receipt_hash,
            verdict,
            confidence_bps,
            timestamp_ms: env::block_timestamp_ms(),
            supersedes,
        };
        self.receipts.insert(code, rec);
    }

    pub fn get_receipt(&self, code: String) -> Option<Record> {
        self.receipts.get(&code).cloned()
    }
}
