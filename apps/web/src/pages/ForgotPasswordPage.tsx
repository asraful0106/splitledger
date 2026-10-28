import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { forgotPasswordSchema, type ForgotPasswordInput } from "shared";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import { messageForError } from "../lib/errors";
import { forgotPassword } from "../lib/session";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordInput) => forgotPassword(values.email),
    onSuccess: () => setSent(true),
    onError: (error) => setFormError(messageForError(error)),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  if (sent) {
    return (
      <Screen>
        <AuthCard title="Check your email" subtitle="If that account exists, a reset link is on its way.">
          <FormMessage tone="success">
            Follow the link in the email to choose a new password.
          </FormMessage>
          <div className="auth-footer">
            <Link className="link" to="/login">
              Back to sign in
            </Link>
          </div>
        </AuthCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthCard
        title="Reset password"
        subtitle="We will email you a link to choose a new password."
        footer={
          <Link className="link" to="/login">
            Back to sign in
          </Link>
        }
      >
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="send"
            placeholder="you@example.com"
            error={formState.errors.email?.message}
            {...register("email")}
          />
          <Button type="submit" loading={mutation.isPending}>
            Send reset link
          </Button>
        </form>
      </AuthCard>
    </Screen>
  );
}
