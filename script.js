const userIn = document.getElementById("user_name");
const passIn = document.getElementById("user_pass");
const submitBtn = document.getElementById("server_submit");
const toggleBtn = document.getElementById("toggle_mode");
const msg = document.getElementById("msg");

let isRegistering = false;

toggleBtn.addEventListener("click", () => {
  isRegistering = !isRegistering;
  msg.textContent = "";
  document.getElementById("form_title").textContent = isRegistering ? "Create an account" : "Welcome back!";
  document.getElementById("form_sub").textContent = isRegistering ? "Join DisJS" : "Log in to DisJS";
  submitBtn.textContent = isRegistering ? "Register" : "Log In";
  toggleBtn.textContent = isRegistering ? "Already have an account? Log In" : "Need an account? Register";
});

async function handleSubmit() {
  msg.textContent = "";
  msg.style.color = "#fa777c";
  const endpoint = isRegistering ? "/register" : "/login";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: userIn.value,
      password: passIn.value
    })
  });

  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "Invalid username or password.";
    return;
  }

  if (isRegistering) {
    isRegistering = false;
    document.getElementById("form_title").textContent = "Welcome back!";
    document.getElementById("form_sub").textContent = "Log in to DisJS";
    submitBtn.textContent = "Log In";
    toggleBtn.textContent = "Need an account? Register";
    msg.style.color = "#23a55a";
    msg.textContent = "Account created! You can now log in.";
  } else {
    window.location.href = "/dashboard";
  }
}

submitBtn.addEventListener("click", handleSubmit);
passIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSubmit();
});
