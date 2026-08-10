import { BoxesIcon, PackageIcon, PlusIcon, TrendingDownIcon, WarehouseIcon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import type { DataColumn } from "@/components/patterns/DataView";
import { DataView } from "@/components/patterns/DataView";
import { FilterBar } from "@/components/patterns/FilterBar";
import { FormError } from "@/components/patterns/FormError";
import { ListCard } from "@/components/patterns/ListCard";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { StatCard, StatGrid } from "@/components/patterns/StatCard";
import {
  ProductStatusBadge,
  StockBadge,
  TransferStatusBadge,
} from "@/components/patterns/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Fab } from "@/components/ui/fab";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Living style guide. Renders every token, primitive and pattern in one place
 * so the visual language can be reviewed and future pages have a reference to
 * copy from instead of improvising new styles.
 */

const NEUTRALS = [
  { name: "background", className: "bg-background border" },
  { name: "card", className: "bg-card border" },
  { name: "muted", className: "bg-muted" },
  { name: "accent", className: "bg-accent" },
  { name: "border", className: "bg-border" },
  { name: "muted-foreground", className: "bg-muted-foreground" },
  { name: "foreground", className: "bg-foreground" },
  { name: "primary", className: "bg-primary" },
];

/** Used for dots and destructive actions only — never for text. */
const ACCENTS = [
  { name: "success", className: "bg-success" },
  { name: "warning", className: "bg-warning" },
  { name: "destructive", className: "bg-destructive" },
  { name: "info", className: "bg-info" },
];

interface DemoRow {
  id: string;
  name: string;
  sku: string;
  price: string;
  qty: number;
  min: number;
}

const DEMO_ROWS: DemoRow[] = [
  { id: "1", name: "Crystal Ceiling Lustre", sku: "LUS-001", price: "249.00", qty: 12, min: 4 },
  {
    id: "2",
    name: "Extendable Curtain Rod 120–210cm",
    sku: "ROD-114",
    price: "34.50",
    qty: 3,
    min: 5,
  },
  { id: "3", name: "Brass Wall Sconce", sku: "SCN-042", price: "89.90", qty: 0, min: 2 },
];

const columns: DataColumn<DemoRow>[] = [
  { key: "name", header: "Product", cell: (r) => <span className="font-medium">{r.name}</span> },
  {
    key: "sku",
    header: "SKU",
    cell: (r) => <span className="text-muted-foreground">{r.sku}</span>,
  },
  {
    key: "stock",
    header: "Stock",
    cell: (r) => <StockBadge quantity={r.qty} minQuantity={r.min} />,
  },
  {
    key: "price",
    header: "Price",
    align: "right",
    className: "tabular-nums",
    cell: (r) => r.price,
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-caps text-muted-foreground">{title}</h2>
      <Separator />
      {children}
    </section>
  );
}

export function StyleGuidePage() {
  const [tab, setTab] = useState("overview");
  const [status, setStatus] = useState("");

  return (
    <PageShell size="wide">
      <PageHeader
        title="Style guide"
        description="Classic Pro — monochrome surfaces, black text, colour reserved for status."
        back="/"
        actions={
          <Button>
            <PlusIcon />
            Primary action
          </Button>
        }
      />

      <Section title="Neutrals">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {NEUTRALS.map((s) => (
            <div key={s.name} className="flex flex-col gap-1.5">
              <div className={`h-14 rounded-md ${s.className}`} />
              <span className="text-muted-foreground text-xs">{s.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Status accents — dots and destructive actions only, never text">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACCENTS.map((s) => (
            <div key={s.name} className="flex flex-col gap-1.5">
              <div className={`h-14 rounded-md ${s.className}`} />
              <span className="text-muted-foreground text-xs">{s.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tracking-tight">Page title — 24px semibold</p>
          <p className="text-lg font-medium">Section heading — 18px medium</p>
          <p className="text-base">
            Body text — 16px on mobile so iOS never zooms a focused field.
          </p>
          <p className="text-muted-foreground text-sm">Secondary text — 14px muted</p>
          <p className="text-muted-foreground text-xs">Caption — 12px muted</p>
        </div>
      </Section>

      <Section title="Buttons — 44px tall on mobile, 36px from md up">
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add">
            <PlusIcon />
          </Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="status">Status</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      <Section title="Status — the label stays black, the dot carries the state">
        <div className="flex flex-wrap gap-2">
          {["draft", "pending", "approved", "completed", "cancelled"].map((s) => (
            <TransferStatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <ProductStatusBadge status="active" />
          <ProductStatusBadge status="archived" />
          <StockBadge quantity={12} minQuantity={4} />
          <StockBadge quantity={3} minQuantity={5} />
          <StockBadge quantity={0} />
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-input">Text input</Label>
            <Input id="sg-input" placeholder="Placeholder…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-select">Native select</Label>
            <NativeSelect id="sg-select" defaultValue="">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-invalid">Invalid state</Label>
            <Input id="sg-invalid" aria-invalid defaultValue="Bad value" />
            <FormError>This field is required.</FormError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-disabled">Disabled</Label>
            <Input id="sg-disabled" disabled placeholder="Disabled" />
          </div>
        </div>
      </Section>

      <Section title="KPI tiles — 2 columns on mobile, 4 from lg">
        <StatGrid>
          <StatCard label="Products" value="128" icon={PackageIcon} />
          <StatCard label="Total stock" value="3,412" icon={BoxesIcon} />
          <StatCard
            label="Low stock"
            value="7"
            icon={TrendingDownIcon}
            tone="warning"
            hint="At or below reorder point"
          />
          <StatCard label="Warehouses" value="4" icon={WarehouseIcon} />
        </StatGrid>
      </Section>

      <Section title="Tabs">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                Arrow keys move between tabs; only the active tab is in the tab order.
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="movements">
            <Card>
              <CardContent className="text-muted-foreground py-6 text-sm">
                Movements panel.
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="settings">
            <Card>
              <CardContent className="text-muted-foreground py-6 text-sm">
                Settings panel.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Filter bar — inline here, a sheet on mobile">
        <FilterBar
          search={<Input placeholder="Search products…" />}
          activeCount={status ? 1 : 0}
          onClear={() => setStatus("")}
        >
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </NativeSelect>
        </FilterBar>
      </Section>

      <Section title="DataView — cards on mobile, table from md">
        <DataView
          rows={DEMO_ROWS}
          columns={columns}
          keyExtractor={(r) => r.id}
          renderCard={(r) => (
            <ListCard
              title={r.name}
              subtitle={`${r.sku} · ${r.price}`}
              meta={<StockBadge quantity={r.qty} minQuantity={r.min} />}
              to="/style"
            />
          )}
        />
        <p className="text-muted-foreground text-xs">
          Narrow the window past 768px to watch the table become cards.
        </p>
      </Section>

      <Section title="Empty state">
        <Card>
          <EmptyState
            icon={PackageIcon}
            title="No products yet"
            description="Add your first product to start tracking inventory."
            action={{ label: "New product", onClick: () => undefined }}
          />
        </Card>
      </Section>

      <Section title="Loading">
        <DataView
          rows={undefined}
          columns={columns}
          keyExtractor={(r) => r.id}
          renderCard={() => null}
          skeletonRows={3}
        />
      </Section>

      <Fab label="New item">
        <PlusIcon />
      </Fab>
    </PageShell>
  );
}
