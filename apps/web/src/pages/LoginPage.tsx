import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { loginSchema, type LoginInput } from "shared";
import { useAuth } from "../auth/AuthContext";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { PasswordField } from "../components/PasswordField";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import { messageForError } from "../lib/errors";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: () => navigate("/", { replace: true }),
    onError: (error) => setFormError(messageForError(error)),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  return (
    <Screen>
      <AuthCard
        title="Sign in"
        subtitle="Track your accounts and split every deposit."
        footer={
          <>
            New here?{" "}
            <Link className="link" to="/register">
              Create an account
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
            autoComplete="current-password"
            enterKeyHint="go"
            error={formState.errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" loading={mutation.isPending}>
            Sign in
          </Button>
          <div className="auth-footer">
            <Link className="link" to="/forgot-password">
              Forgot password?
            </Link>
          </div>
        </form>
      </AuthCard>
    </Screen>
  );
}
