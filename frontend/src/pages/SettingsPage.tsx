import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BuildingIcon,
  CameraIcon,
  LayersIcon,
  PlusIcon,
  ScrollTextIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { NavLink } from "react-router";
import { z } from "zod";

import { ProductImage } from "@/components/ProductImage";
import { TableLoader } from "@/components/TableLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActivityLog, useErrorLog } from "@/features/logs/hooks";
import {
  createPlatformUser,
  fetchPlatformTenants,
  fetchPlatformUsers,
  type CreateUserInput,
} from "@/features/platform/api";
import {
  updateTenantName,
  uploadTenantLogo,
  deleteTenantLogo,
} from "@/features/tenants/api";
import { resolveProductThumbUrl } from "@/features/products/api";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store/authStore";

const tabs = ["Business", "Profile", "Preferences", "Logs", "Super Admin"] as const;
type Tab = (typeof tabs)[number];

const userSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1, "Required"),
  password: z.string().min(8, "Minimum 8 characters"),
});

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export function SettingsPage() {
  const { isSuperuser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>("Business");
  const [sheetOpen, setSheetOpen] = useState(false);
  const queryClient = useQueryClient();

  const showSuperAdminData = activeTab === "Super Admin" && isSuperuser;

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["platform-users"],
    queryFn: fetchPlatformUsers,
    enabled: showSuperAdminData,
  });
  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: fetchPlatformTenants,
    enabled: showSuperAdminData,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(userSchema),
  });

  const createUserMutation = useMutation({
    mutationFn: createPlatformUser,
    onSuccess: () => {
      setSheetOpen(false);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["platform-users"] });
    },
    onError: () => toast({ title: "Failed to create user", variant: "destructive" }),
  });

  const onSubmit = handleSubmit((values) => {
    createUserMutation.mutate(values);
  });
  const loading = createUserMutation.isPending;

  const visibleTabs = isSuperuser ? tabs : tabs.filter((t) => t !== "Super Admin");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="flex min-w-0 gap-1 overflow-x-auto rounded-md border p-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex shrink-0 items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:flex-1 ${
              activeTab === tab ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            {tab === "Business" && <BuildingIcon className="size-4" />}
            {tab === "Profile" && <UserIcon className="size-4" />}
            {tab === "Logs" && <ScrollTextIcon className="size-4" />}
            {tab === "Super Admin" && <ShieldIcon className="size-4" />}
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Business" && <BusinessPanel />}

      {activeTab === "Profile" && (
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Coming soon: name, email, password change.
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === "Preferences" && (
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <NavLink to="/categories">
              <Button variant="outline" className="w-full justify-start">
                <LayersIcon className="mr-2 size-4" />
                Manage categories
              </Button>
            </NavLink>
            <p className="text-muted-foreground text-sm">
              Coming soon: default warehouse, theme, language.
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === "Logs" && <LogsPanel />}

      {activeTab === "Super Admin" && isSuperuser && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Users</CardTitle>
                <Button size="sm" onClick={() => setSheetOpen(true)}>
                  <PlusIcon className="mr-1 size-4" />
                  Create user
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <TableLoader rows={3} columns={4} />
              ) : users.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">No users found</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-left">
                      <tr>
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Email</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-accent/50 border-t">
                          <td className="px-4 py-2">{u.full_name}</td>
                          <td className="text-muted-foreground px-4 py-2">{u.email}</td>
                          <td className="px-4 py-2">
                            <Badge variant={u.is_active ? "default" : "outline"}>
                              {u.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            {u.is_superuser ? (
                              <Badge variant="secondary">Super Admin</Badge>
                            ) : (
                              <span className="text-muted-foreground">User</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  <BuildingIcon className="mr-2 inline size-4" />
                  Tenants
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {tenantsLoading ? (
                <TableLoader rows={3} columns={3} />
              ) : tenants.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">No tenants found</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-left">
                      <tr>
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Slug</th>
                        <th className="px-4 py-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((t) => (
                        <tr key={t.id} className="hover:bg-accent/50 border-t">
                          <td className="px-4 py-2">{t.name}</td>
                          <td className="text-muted-foreground px-4 py-2">{t.slug}</td>
                          <td className="text-muted-foreground px-4 py-2">
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Create user</SheetTitle>
          </SheetHeader>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" {...register("full_name")} />
              {errors.full_name && (
                <p className="text-destructive text-sm">{errors.full_name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && (
                <p className="text-destructive text-sm">{errors.password.message}</p>
              )}
            </div>
            <SheetFooter className="px-0">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create user"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BusinessPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { tenantName, tenantLogoUrl } = useAuthStore();
  const [name, setName] = useState(tenantName);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleNameSave = async () => {
    if (!name.trim() || name === tenantName) return;
    setSaving(true);
    try {
      await updateTenantName(name.trim());
      toast({ title: "Business name updated" });
    } catch {
      toast({ title: "Failed to update name", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast({ title: "Image exceeds 5 MB limit", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      await uploadTenantLogo(file);
      toast({ title: "Logo uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteLogo = async () => {
    try {
      await deleteTenantLogo();
      toast({ title: "Logo removed" });
    } catch {
      toast({ title: "Failed to remove logo", variant: "destructive" });
    }
  };

  const resolvedLogo = resolveProductThumbUrl(tenantLogoUrl);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Label>Logo</Label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-muted hover:bg-accent flex size-20 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors"
            >
              {resolvedLogo ? (
                <ProductImage src={resolvedLogo} alt="Logo" className="size-full object-contain" />
              ) : (
                <span className="text-muted-foreground text-2xl font-bold">
                  {tenantName?.charAt(0)?.toUpperCase() || "B"}
                </span>
              )}
            </button>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <CameraIcon className="mr-1 size-4" />
                {uploading ? "Uploading…" : "Upload logo"}
              </Button>
              {tenantLogoUrl && (
                <Button variant="ghost" size="sm" onClick={() => void handleDeleteLogo()}>
                  <TrashIcon className="mr-1 size-4" />
                  Remove
                </Button>
              )}
              <p className="text-muted-foreground text-xs">JPEG, PNG, or WebP. Max 5 MB.</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleLogoUpload(e)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="business-name">Business name</Label>
          <div className="flex gap-2">
            <Input
              id="business-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your business name"
            />
            <Button
              variant="outline"
              disabled={saving || !name.trim() || name === tenantName}
              onClick={() => void handleNameSave()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LogsPanel() {
  const [view, setView] = useState<"activity" | "errors">("activity");
  const activity = useActivityLog();
  const errors = useErrorLog();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-md border p-1">
          {(["activity", "errors"] as const).map((viewName) => (
            <button
              key={viewName}
              type="button"
              onClick={() => setView(viewName)}
              className={`flex shrink-0 items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:flex-1 ${
                view === viewName ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {viewName === "activity" ? "Activity" : "Errors"}
            </button>
          ))}
        </div>

        {view === "activity" ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">What happened</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {activity.isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4">
                      <TableLoader rows={4} columns={3} />
                    </td>
                  </tr>
                ) : (activity.data?.data.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted-foreground px-4 py-4 text-center">
                      No activity yet
                    </td>
                  </tr>
                ) : (
                  activity.data?.data.map((entry) => (
                    <tr key={entry.id} className="hover:bg-accent/50 border-t">
                      <td className="px-4 py-2">
                        <span className="block">{entry.message}</span>
                        <span className="text-muted-foreground block text-xs">
                          {entry.entity_type} · {entry.operation}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline">{entry.entity_type}</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-2">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Message</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {errors.isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4">
                      <TableLoader rows={4} columns={3} />
                    </td>
                  </tr>
                ) : (errors.data?.data.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted-foreground px-4 py-4 text-center">
                      No errors recorded
                    </td>
                  </tr>
                ) : (
                  errors.data?.data.map((entry) => (
                    <tr key={entry.id} className="hover:bg-accent/50 border-t">
                      <td className="px-4 py-2">
                        <span className="block">
                          {entry.level === "error" ? (
                            <Badge variant="destructive" className="mr-2">
                              error
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="mr-2">
                              {entry.level}
                            </Badge>
                          )}
                          {entry.message}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {entry.method} {entry.path}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <code className="text-xs">{entry.code}</code>
                      </td>
                      <td className="text-muted-foreground px-4 py-2">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
