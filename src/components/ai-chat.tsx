import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, Mic, MicOff, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/rich-text";
import { toast } from "sonner";
import { usePos } from "@/lib/pos-store";
import { ReservationModal } from "@/components/reservation-modal";

type Msg = { role: "user" | "assistant"; content: string };
type Pending = { kind: "book_table" | "waitlist" | "seat_walkin" | "checkout" | "order_items"; params: Record<string, any>; summary: string };

const STARTERS = [
  "🚶 Seat walk-in (2 guests)",
  "What is on the menu today?",
  "Order 2 Margheritas for T1",
  "Which tables are free?",
  "Add walk-in to waitlist",
  "Book a table for 4 at 19:30",
  "Settle bill on Table 2 with cash",
];

export function AiChat() {
  const { tables } = usePos();
  const [open, setOpen] = useState(false);
  const [showResModal, setShowResModal] = useState(false);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I am your AI Restaurant Assistant. I can take food orders for tables, answer menu and stock questions, book tables, manage waitlists, and settle bills. Speak or type your request below." },
  ]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  const toggleListening = () => {
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsListening(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error("Speech dictation is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setIsListening(true);
        toast.info("Listening... speak your order or question.", { duration: 3000 });
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e);
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setPending(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      // Loaded on demand so the database code is not part of the first page load.
      const { chatFn } = await import("@/lib/chat");
      const res = await chatFn({ data: { message, history } });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setPending((res.pending as Pending | null) ?? null);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const { confirmChatActionFn } = await import("@/lib/chat");
      const res = await confirmChatActionFn({ data: { pending } });
      setMessages((m) => [...m, { role: "assistant", content: `Done! ${res.message}` }]);
      toast.success(res.message);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "That did not go through." }]);
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const cancel = () => {
    setPending(null);
    setMessages((m) => [...m, { role: "assistant", content: "Cancelled. Nothing was changed." }]);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[72vh] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>AI Assistant</span>
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Live</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Voice & text ordering, tables, bookings and bills</div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => send("Seat walk-in party of 2")}
                className="h-7 text-xs px-2 gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 hover:bg-amber-500/20"
                title="Quick Walk-in Table Allocation"
              >
                🚶 Walk-in
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResModal(true)}
                className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Open Reservation & Waitlist Modal"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Book
              </Button>
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
                  {m.role === "assistant" && (m.content.toLowerCase().includes("waitlist") || m.content.toLowerCase().includes("book")) && (
                    <div className="mt-2 pt-1 border-t border-border/40">
                      <button
                        type="button"
                        onClick={() => setShowResModal(true)}
                        className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline cursor-pointer"
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> Open reservation / waitlist form
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-muted-foreground animate-pulse">Assistant is thinking…</div>}
            {pending && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  {pending.kind === "seat_walkin" ? "🚶 Walk-in Table Allocation" : "Confirm this action"}
                </div>
                <div className="mt-1 text-amber-900 dark:text-amber-300">{pending.summary}</div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={confirm} disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white">
                    {pending.kind === "seat_walkin" ? "Confirm & Seat Guest" : "Confirm & Execute"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">{s}</button>
              ))}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t p-3 bg-muted/20">
            <button
              type="button"
              onClick={toggleListening}
              className={`p-2 rounded-md transition-colors ${isListening ? "bg-red-500 text-white animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              title={isListening ? "Stop listening" : "Click to speak hands-free"}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening... speak now" : "Ask or say 'Order 2 Pizzas for T1'..."}
              maxLength={1000}
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}
      <ReservationModal
        isOpen={showResModal}
        onClose={() => setShowResModal(false)}
        tables={tables}
      />
    </>
  );
}
