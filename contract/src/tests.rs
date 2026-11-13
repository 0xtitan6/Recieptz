use super::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::testing_env;

const TIMEOUT_MS: u64 = 15 * 60 * 1000;

fn set_caller(caller: AccountId, now_ms: u64) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(caller)
        .block_timestamp(now_ms * 1_000_000) // block time is in nanoseconds
        .build());
}

fn triage() -> AccountId {
    accounts(1)
}

fn jury() -> AccountId {
    accounts(2)
}

fn setup() -> Contract {
    set_caller(accounts(0), 0);
    let mut c = Contract::new(triage(), jury(), TIMEOUT_MS);
    set_caller(triage(), 1_000);
    c.register_claim("run-1".into(), "post-111".into(), "hash-a".into(), "glm,qwen,haiku".into());
    c
}

#[test]
fn register_creates_pending_run() {
    let c = setup();
    let run = c.get_run("run-1".into()).unwrap();
    assert!(run.status == Status::Pending);
    assert_eq!(run.registered_at_ms, 1_000);
    assert_eq!(c.get_runs_by_post("post-111".into()).len(), 1);
}

#[test]
fn verdict_before_timeout() {
    let mut c = setup();
    set_caller(jury(), 60_000);
    c.submit_verdict("run-1".into(), Label::False, "cid-1".into());
    let run = c.get_run("run-1".into()).unwrap();
    assert!(run.status == Status::Verdict(Label::False));
    assert_eq!(run.receipt_cid, Some("cid-1".into()));
}

#[test]
fn pending_run_shows_abandoned_after_timeout() {
    let c = setup();
    set_caller(accounts(3), 1_000 + TIMEOUT_MS + 1);
    assert!(c.get_run("run-1".into()).unwrap().status == Status::Abandoned);
}

#[test]
fn verdict_after_timeout_is_late() {
    let mut c = setup();
    set_caller(jury(), 1_000 + TIMEOUT_MS + 1);
    c.submit_verdict("run-1".into(), Label::True, "cid-1".into());
    assert!(c.get_run("run-1".into()).unwrap().status == Status::Late(Label::True));
}

#[test]
#[should_panic(expected = "verdict already exists")]
fn second_verdict_rejected() {
    let mut c = setup();
    set_caller(jury(), 60_000);
    c.submit_verdict("run-1".into(), Label::False, "cid-1".into());
    c.submit_verdict("run-1".into(), Label::True, "cid-2".into());
}

#[test]
#[should_panic(expected = "only jury")]
fn triage_cannot_submit_verdict() {
    let mut c = setup();
    set_caller(triage(), 60_000);
    c.submit_verdict("run-1".into(), Label::False, "cid-1".into());
}

#[test]
#[should_panic(expected = "run_id already exists")]
fn duplicate_run_id_rejected() {
    let mut c = setup();
    c.register_claim("run-1".into(), "post-111".into(), "hash-b".into(), "glm,qwen,haiku".into());
}

#[test]
fn post_history_keeps_all_runs() {
    let mut c = setup();
    c.register_claim("run-2".into(), "post-111".into(), "hash-b".into(), "glm,qwen,haiku".into());
    set_caller(jury(), 60_000);
    c.submit_verdict("run-2".into(), Label::Misleading, "cid-2".into());
    set_caller(accounts(3), 1_000 + TIMEOUT_MS + 1);
    let runs = c.get_runs_by_post("post-111".into());
    assert_eq!(runs.len(), 2);
    assert!(runs[0].status == Status::Abandoned);
    assert!(runs[1].status == Status::Verdict(Label::Misleading));
}
