import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLoginMutation } from "@/features/auth/hooks";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });
  const loginMutation = useLoginMutation();

  const onSubmit = handleSubmit((values) => loginMutation.mutate(values));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
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

          <Button type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in…" : "Sign in"}
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            No account?{" "}
            <Link to="/register" className="text-primary underline-offset-4 hover:underline">
              Register
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
