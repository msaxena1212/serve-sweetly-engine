import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Plus, Check } from 'lucide-react';

interface ItemModifiersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  onApply: (modifiers: string[], customNotes: string) => void;
}

const COMMON_MODIFIERS = [
  'Less Spicy',
  'Extra Spicy',
  'No Onion / Garlic',
  'Extra Cheese',
  'Crispy / Well Done',
  'Oat Milk',
  'Almond Milk',
  'Extra Hot',
  'Less Ice',
  'No Sugar',
  'Half Sweet',
  'Pack Separately',
];

export function ItemModifiersDialog({
  open,
  onOpenChange,
  itemName,
  onApply,
}: ItemModifiersDialogProps) {
  const [selectedMods, setSelectedMods] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState('');

  const toggleMod = (mod: string) => {
    if (selectedMods.includes(mod)) {
      setSelectedMods(selectedMods.filter((m) => m !== mod));
    } else {
      setSelectedMods([...selectedMods, mod]);
    }
  };

  const handleConfirm = () => {
    onApply(selectedMods, customNote);
    setSelectedMods([]);
    setCustomNote('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <DialogHeader className="mb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ChefHat className="w-4 h-4 text-primary" />
            <span>Modifiers for {itemName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Common Customizations & Dietary Preferences:
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_MODIFIERS.map((mod) => {
                const isSelected = selectedMods.includes(mod);
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleMod(mod)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors border ${
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/40 hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-muted-foreground" />}
                    {mod}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Custom Chef Instructions / Allergy Notes:
            </label>
            <textarea
              className="w-full rounded-md border bg-background p-2 text-xs h-20 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Mild dressing on the side, allergic to peanuts…"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            Apply Instructions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
