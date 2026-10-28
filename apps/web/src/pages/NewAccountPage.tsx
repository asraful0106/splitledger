import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { CURRENCIES, CURRENCY_CODES } from "shared";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import { createAccount, type CreateAccountPayload } from "../lib/accounts";
import { messageForError } from "../lib/errors";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  bankName: z.string().min(1, "Bank name is required").max(80),
  last4: z
    .string()
    .optional()
    .refine((value) => !value || /^\d{4}$/.test(value), { message: "Use the last 4 digits" }),
  currency: z.enum(CURRENCY_CODES).default("BDT"),
});

type FormValues = z.infer<typeof formSchema>;

export function NewAccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", bankName: "", last4: "", currency: "BDT" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: CreateAccountPayload = {
        name: values.name,
        bankName: values.bankName,
        currency: values.currency,
      };
      if (values.last4) {
        payload.last4 = values.last4;
      }
      return createAccount(payload);
    },
    onSuccess: (account) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      navigate(`/accounts/${account.id}`, { replace: true });
    },
    onError: (error) => setFormError(messageForError(error)),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  return (
    <Screen>
      <AuthCard
        title="Add account"
        subtitle="Track one of your real bank accounts. We never store full account numbers."
        footer={
          <Link className="link" to="/">
            Back to accounts
          </Link>
        }
      >
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
          <TextField
            label="Nickname"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="e.g. Salary account"
            error={formState.errors.name?.message}
            {...register("name")}
          />
          <TextField
            label="Bank name"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="e.g. BRAC Bank"
            error={formState.errors.bankName?.message}
            {...register("bankName")}
          />
          <TextField
            label="Last 4 digits (optional)"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={4}
            placeholder="1234"
            hint="Never enter a full account or card number."
            error={formState.errors.last4?.message}
            {...register("last4")}
          />
          <div className="field">
            <label className="field-label" htmlFor="currency">
              Currency
            </label>
            <select id="currency" className="field-input" {...register("currency")}>
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={mutation.isPending}>
            Create account
          </Button>
        </form>
      </AuthCard>
    </Screen>
  );
}
