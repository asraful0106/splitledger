import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { passwordSchema } from "shared";
import { z } from "zod";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { PasswordField } from "../components/PasswordField";
import { Screen } from "../components/Screen";
import { messageForError } from "../lib/errors";
import { resetPassword } from "../lib/session";

const formSchema = z.object({ password: passwordSchema });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      resetPassword({ token: token ?? "", password: values.password }),
    onSuccess: () => setDone(true),
    onError: (error) => setFormError(messageForError(error)),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  if (!token) {
    return (
      <Screen>
        <AuthCard title="Reset password" subtitle="This link is incomplete.">
          <FormMessage tone="error">This link is missing its token.</FormMessage>
          <div className="auth-footer">
            <Link className="link" to="/forgot-password">
              Request a new link
            </Link>
          </div>
        </AuthCard>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <AuthCard title="Password updated" subtitle="You can now sign in with your new password.">
          <FormMessage tone="success">Your password has been changed.</FormMessage>
          <div className="auth-footer">
            <Link className="link" to="/login">
              Go to sign in
            </Link>
          </div>
        </AuthCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthCard title="Choose a new password" subtitle="Make it at least 10 characters.">
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            enterKeyHint="done"
            hint="At least 10 characters."
            error={formState.errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" loading={mutation.isPending}>
            Update password
          </Button>
        </form>
      </AuthCard>
    </Screen>
  );
}
