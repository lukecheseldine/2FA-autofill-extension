// Handle popup UI and authentication

document.addEventListener("DOMContentLoaded", function () {
    console.log("Popup opened");
    const authStatus = document.getElementById("auth-status");
    const authButton = document.getElementById("auth-button");

    // Check authentication status
    chrome.runtime.sendMessage({ action: "checkAuthStatus" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error(
                "Error checking auth status:",
                chrome.runtime.lastError
            );
            authStatus.textContent = "Error checking status";
            authStatus.style.color = "red";
            return;
        }

        console.log(
            `Auth status response: ${
                response.authenticated ? "Authenticated" : "Not authenticated"
            }`
        );
        updateAuthStatus(response.authenticated);
    });

    // Handle authentication button click
    authButton.addEventListener("click", () => {
        console.log("Auth button clicked");
        authStatus.textContent = "Authenticating...";
        authStatus.style.color = "blue";

        chrome.runtime.sendMessage({ action: "authenticate" }, (response) => {
            if (chrome.runtime.lastError || !response.success) {
                console.error(
                    "Authentication failed:",
                    chrome.runtime.lastError || response.message
                );
                authStatus.textContent = "Authentication failed";
                authStatus.style.color = "red";
                return;
            }

            console.log("Authentication successful");
            updateAuthStatus(true);
        });
    });

    function updateAuthStatus(authenticated) {
        if (authenticated) {
            authStatus.textContent = "Authenticated";
            authStatus.style.color = "green";
            authButton.textContent = "Re-authenticate";
        } else {
            authStatus.textContent = "Not authenticated";
            authStatus.style.color = "red";
            authButton.textContent = "Authenticate with Gmail";
        }
    }
});
