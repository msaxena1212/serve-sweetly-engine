import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Wallet, LogOut, CheckCircle } from "lucide-react";
import { getShiftStatusFn, openShiftFn, closeShiftFn } from "@/lib/api";

export const Route = createFileRoute("/shift")({
  beforeLoad: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    return await getShiftStatusFn();
  },
  component: ShiftPage,
});

function ShiftPage() {
  const router = useRouter();
  const { isActive, shift } = Route.useLoaderData();
  const [loading, setLoading] = useState(false);

  // Form states
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [expectedCash, setExpectedCash] = useState("");

  const handleOpenShift = async () => {
    if (!openingCash || isNaN(Number(openingCash))) {
      toast.error("Please enter a valid opening cash amount.");
      return;
    }
    setLoading(true);
    try {
      await openShiftFn({ data: { openingCash: parseFloat(openingCash) } });
      toast.success("Shift opened successfully.");
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message || "Failed to open shift.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!closingCash || isNaN(Number(closingCash))) {
      toast.error("Please enter the actual cash in drawer.");
      return;
    }
    
    // For demo purposes, we will mock the expected cash since we're not aggregating all payments locally yet.
    // In a real system, `expectedCash` = openingCash + Cash Payments - Cash Refunds.
    const actual = parseFloat(closingCash);
    const expected = expectedCash ? parseFloat(expectedCash) : parseFloat(shift?.openingCash || "0");
    const variance = actual - expected;

    setLoading(true);
    try {
      await closeShiftFn({ data: { closingCash: actual, expectedCash: expected, variance } });
      toast.success(`Shift closed. Variance: ₹${variance.toFixed(2)}`);
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message || "Failed to close shift.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md shadow-lg border-2">
        <CardHeader className="text-center space-y-1">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Shift Management</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isActive ? "Manage and close your active shift." : "Start a new shift to begin billing."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isActive ? (
            <div className="space-y-4">
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md text-center font-medium">
                No active shift. POS billing is locked.
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Opening Cash (₹)</label>
                <Input 
                  type="number" 
                  placeholder="e.g. 5000" 
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="text-lg"
                />
                <p className="text-xs text-muted-foreground">Enter the physical cash amount currently in the drawer.</p>
              </div>
              <Button className="w-full h-11 text-base font-semibold" onClick={handleOpenShift} disabled={loading}>
                Open Shift
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-500/10 text-green-700 text-sm p-3 rounded-md text-center font-medium flex items-center justify-center gap-2">
                <CheckCircle className="h-4 w-4" /> Shift Active since {new Date(shift.openedAt).toLocaleTimeString()}
              </div>
              <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-card">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Opening Cash</p>
                  <p className="text-xl font-bold">₹{parseFloat(shift.openingCash).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Expected Cash</p>
                  <Input 
                    type="number" 
                    placeholder="Auto-calculated" 
                    value={expectedCash}
                    onChange={(e) => setExpectedCash(e.target.value)}
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-sm font-medium text-destructive">Actual Cash in Drawer (₹) *</label>
                <Input 
                  type="number" 
                  placeholder="Count physical cash" 
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  className="text-lg border-destructive/50 focus-visible:ring-destructive"
                />
              </div>
              
              <Button variant="destructive" className="w-full h-11 text-base font-semibold" onClick={handleCloseShift} disabled={loading}>
                <LogOut className="h-4 w-4 mr-2" />
                Close Shift
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
