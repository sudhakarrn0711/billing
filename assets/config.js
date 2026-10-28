// STEP 1: Environment selector
let ENV = localStorage.getItem("billing_env") || "test";  // default to live if not set

// STEP 2: URLs per environment
const BILLING_CONFIG = {
  live: {
    billing: "https://script.google.com/macros/s/AKfycbzlM5fukQoyx5BHAFyYLQE9RmMP06y5tnowkpLzI81ApOl9RlTwl8FZQLmFtYji8Wy-/exec",
  },
  test: {
    billing: "https://script.google.com/macros/s/AKfycbzlM5fukQoyx5BHAFyYLQE9RmMP06y5tnowkpLzI81ApOl9RlTwl8FZQLmFtYji8Wy-/exec",
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
