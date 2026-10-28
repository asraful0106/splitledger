import { ApiError } from "./api";

export function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "invalid_credentials":
        return "Invalid email or password.";
      case "email_taken":
        return "That email is already registered.";
      case "rate_limited":
        return "Too many attempts. Please wait a moment and try again.";
      case "validation_error":
        return "Please check the details and try again.";
      case "invalid_token":
        return "This link is invalid or has already been used.";
      case "token_expired":
        return "This link has expired. Request a new one.";
      case "unauthenticated":
        return "Your session expired. Please sign in again.";
      default:
        return error.message;
    }
  }
  return "Network error. Check your connection and try again.";
}
