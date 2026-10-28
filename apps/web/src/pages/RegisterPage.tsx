import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { registerSchema, type RegisterInput } from "shared";
import { useAuth } from "../auth/AuthContext";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { PasswordField } from "../components/PasswordField";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import { messageForError } from "../lib/errors";

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const mutation = useMutation({
    mutationFn: registerUser,
    onSuccess: () => setSubmitted(true),
    onError: (error) => setFormError(messageForError(error)),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  if (submitted) {
    return (
      <Screen>
        <AuthCard title="Check your email" subtitle="We sent you a verification link.">
          <FormMessage tone="success">
            Open the link in your inbox to verify your email address, then come back and sign in.
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
        title="Create account"
        subtitle="One login for all your bank accounts."
        footer={
          <>
            Already have an account?{" "}
            <Link className="link" to="/login">
              Sign in
            </Link>
          </>
        }
      >
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="next"
            placeholder="you@example.com"
            error={formState.errors.email?.message}
            {...register("email")}
          />
          <PasswordField
            label="Password"
            autoComplete="new-password"
            enterKeyHint="done"
            hint="At least 10 characters."
            error={formState.errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" loading={mutation.isPending}>
            Create account
          </Button>
        </form>
      </AuthCard>
    </Screen>
  );
}
