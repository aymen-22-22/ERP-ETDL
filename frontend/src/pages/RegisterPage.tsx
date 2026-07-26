import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegisterMutation } from "@/features/auth/hooks";

const registerSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  tenantName: z.string().min(1, "Business name is required"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });
  const registerMutation = useRegisterMutation();

  const onSubmit = handleSubmit((values) => registerMutation.mutate(values));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" {...registerField("fullName")} />
            {errors.fullName && (
              <p className="text-destructive text-sm">{errors.fullName.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenantName">Business name</Label>
            <Input id="tenantName" {...registerField("tenantName")} />
            {errors.tenantName && (
              <p className="text-destructive text-sm">{errors.tenantName.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...registerField("email")} />
            {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...registerField("password")} />
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? "Creating account…" : "Create account"}
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
