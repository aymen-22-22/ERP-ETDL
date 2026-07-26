import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { ApiError } from "@/services/api/client";
import { toast } from "@/lib/toast";

import { login, logout, register } from "./api";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "unauthorized") return "Incorrect email or password.";
    if (error.code === "permission_denied") return "You don't have access to that business.";
    if (error.code === "email_taken") return "That email is already registered.";
  }
  return "Something went wrong. Please try again.";
}

export function useLoginMutation() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: login,
    onSuccess: () => navigate("/"),
    onError: (error) =>
      toast({ title: "Login failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useRegisterMutation() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: register,
    onSuccess: (result) => {
      toast({
        title: "Account created",
        description: `Your Business ID is ${result.tenantId} — you'll need it to sign in.`,
      });
      void navigate("/login");
    },
    onError: (error) =>
      toast({
        title: "Registration failed",
        description: errorMessage(error),
        variant: "destructive",
      }),
  });
}

export function useLogoutMutation() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => navigate("/login"),
  });
}
