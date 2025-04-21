// Handle authentication and Gmail API requests
let authToken = null;

// Initialize when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    console.log("2FA Autofill extension installed");
    checkAuthStatus();
});

// Check if user is authenticated
function checkAuthStatus() {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
            authToken = token;
            console.log("User is already authenticated");
        } else {
            console.log("User is not authenticated");
        }
    });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "findAuthCode") {
        if (!authToken) {
            sendResponse({ success: false, message: "Not authenticated" });
            return true;
        }

        findAuthCodeInGmail(request.domain)
            .then((code) => {
                sendResponse({ success: true, code: code });
            })
            .catch((error) => {
                console.error("Error finding auth code:", error);
                sendResponse({ success: false, message: error.message });
            });

        return true; // Required for async sendResponse
    } else if (request.action === "authenticate") {
        authenticateUser()
            .then((token) => {
                authToken = token;
                sendResponse({ success: true });
            })
            .catch((error) => {
                console.error("Authentication error:", error);
                sendResponse({ success: false, message: error.message });
            });

        return true; // Required for async sendResponse
    } else if (request.action === "checkAuthStatus") {
        if (authToken) {
            sendResponse({ authenticated: true });
        } else {
            sendResponse({ authenticated: false });
        }
        return true;
    }
});

// Authenticate user with Google
function authenticateUser() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (token) {
                resolve(token);
            } else {
                reject(new Error("Failed to get auth token"));
            }
        });
    });
}

// Search Gmail for authentication codes
async function findAuthCodeInGmail(domain) {
    try {
        // Search for recent emails that might contain auth codes (last 10 minutes)
        const query = `from:(${domain}) OR subject:(verification code) OR subject:(security code) OR subject:(authentication) newer_than:10m`;
        const encodedQuery = encodeURIComponent(query);

        // Search for messages
        const searchResponse = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodedQuery}`,
            { headers: { Authorization: `Bearer ${authToken}` } }
        );

        const searchData = await searchResponse.json();

        if (!searchData.messages || searchData.messages.length === 0) {
            console.log("No relevant emails found");
            return null;
        }

        // Get the most recent message
        const messageId = searchData.messages[0].id;
        const messageResponse = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
            { headers: { Authorization: `Bearer ${authToken}` } }
        );

        const messageData = await messageResponse.json();

        // Extract message body
        let body = "";
        if (messageData.payload.parts) {
            // Multi-part message
            for (const part of messageData.payload.parts) {
                if (part.mimeType === "text/plain" && part.body.data) {
                    body += atob(
                        part.body.data.replace(/-/g, "+").replace(/_/g, "/")
                    );
                }
            }
        } else if (messageData.payload.body.data) {
            // Single part message
            body = atob(
                messageData.payload.body.data
                    .replace(/-/g, "+")
                    .replace(/_/g, "/")
            );
        }

        // Look for common 2FA code patterns (4-8 digits)
        const codeMatch =
            body.match(
                /(?:code|pin|passcode|verification|auth)[^\d]*(\d{4,8})[^\d]/i
            ) ||
            body.match(/(\d{6})[^\d]/) ||
            body.match(/verification code:?\s*(\d{4,8})/i) ||
            body.match(/security code:?\s*(\d{4,8})/i) ||
            body.match(/one-?time code:?\s*(\d{4,8})/i);

        return codeMatch ? codeMatch[1] : null;
    } catch (error) {
        console.error("Error searching Gmail:", error);
        throw error;
    }
}
