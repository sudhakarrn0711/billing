// STEP 1: Environment selector
let ENV = localStorage.getItem("billing_env") || "test";  // default to live if not set

// STEP 2: URLs per environment
const BILLING_CONFIG = {
  live: {
    billing: "https://script.google.com/macros/s/AKfycbxIgRstfyTxpbLVRd8r01X09HuaXglT2sFEMGA5dASVeM644f4d4XBcC056owEbTA1pIQ/exec",
  },
  test: {
    billing: "https://script.google.com/macros/s/AKfycbxsgylO0fJkiGHNcM24r77i1kivh4xcNMJtP1wKa1FC1Klwsr4cbZXBKBgLwkUNWRAFJQ/exec",
  }
};

// STEP 3: Helper function to get URL
function getBillingURL() {
  return BILLING_CONFIG[ENV].billing;
}

// STEP 4: Change environment
function setEnvironment(env) {
  ENV = env;
  localStorage.setItem("billing_env", env);
  location.reload(); // reload page to re-fetch with new environment
}
