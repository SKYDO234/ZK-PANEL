import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  ShieldCheck,
  Check,
  ReceiptText,
  Download,
  Info,
  Sparkles,
  Clock3,
  Search,
  ChevronRight,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api, money, date } from "../lib/api";
import type { Invoice } from "../../shared/types";
import {
  PageHeader,
  Panel,
  PanelHeading,
  Button,
  Badge,
  Modal,
  EmptyState,
  Loading,
} from "../components/ui";
export default function Billing() {
  const { data, refresh, toast } = useStore();
  const [params, setParams] = useSearchParams();
  const [topup, setTopup] = useState(false),
    [amount, setAmount] = useState(50000),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [detail, setDetail] = useState<Invoice | null>(null);
  const d = data!;
  useEffect(() => {
    const invoiceId = params.get("checkout");
    if (!invoiceId) return;
    let active = true;
    let count = 0;
    const poll = async () => {
      try {
        const invoice = await api<Invoice>("/billing/invoices/" + invoiceId);
        if (!active) return;
        if (invoice.status === "paid") {
          toast("Payment verified. Your wallet is topped up.");
          await refresh();
          setParams({});
          return;
        }
        if (invoice.status === "failed") {
          toast("Payment was not completed.", "error");
          setParams({});
          return;
        }
      } catch {}
      if (++count < 20 && active) setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      active = false;
    };
  }, [params.get("checkout")]);
  const checkout = async () => {
    setBusy(true);
    try {
      if (d.mode === "demo") {
        await api("/billing/demo-credit", { body: { amount } });
        toast("Demo funds added. No real payment was made.");
      } else {
        const result = await api<{ url: string }>("/billing/checkout", {
          body: { amount },
        });
        window.location.assign(result.url);
        return;
      }
      await refresh();
      setTopup(false);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const list = d.invoices.filter((i) => filter === "all" || i.type === filter);
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="SIMPLE, PREDICTABLE, YOURS"
        title="Billing & wallet"
        description="More creating. Fewer surprises. Keep your next idea funded."
      >
        <Badge tone="green">
          <ShieldCheck size={13} />
          NO AUTOMATIC CHARGES
        </Badge>
      </PageHeader>
      <div className="billing-top">
        <Panel className="wallet-card">
          <div className="wallet-label">
            <Wallet size={19} />
            <span>YOUR WALLET BALANCE</span>
            <Badge tone="green">
              {d.mode === "demo" ? "DEMO FUNDS" : "INR"}
            </Badge>
          </div>
          <div className="wallet-amount">
            {money(d.user.balance)}
            <span>Available for your next big thing</span>
          </div>
          <div className="wallet-actions">
            <Button onClick={() => setTopup(true)}>
              <Plus size={16} />
              Add funds
            </Button>
            <span>
              <ShieldCheck size={14} />
              {d.mode === "demo"
                ? "No real money is used in this preview"
                : "Secure checkout powered by Stripe"}
            </span>
          </div>
          <div className="wallet-decoration">
            <span />
            <span />
            <span />
          </div>
        </Panel>
        <Panel className="billing-summary">
          <PanelHeading title="Your hosting, at a glance" />
          <div>
            <span>Active deployments</span>
            <strong>
              {d.servers.filter((s) => s.status === "running").length}
            </strong>
          </div>
          <div>
            <span>Monthly allocation</span>
            <strong>
              {money(d.servers.reduce((a, s) => a + s.monthlyCost, 0))}
            </strong>
          </div>
          <div>
            <span>Billing model</span>
            <Badge tone="green">Prepaid wallet</Badge>
          </div>
          <p>
            <Info size={14} />
            Plans are charged for 30 days at launch. Renew from a deployment's
            settings.
          </p>
        </Panel>
      </div>
      <div className="section-label-row">
        <h2>A plan for every possibility</h2>
        <span className="muted">
          All plans include Autopilot, backups, and the full ZK toolkit.
        </span>
      </div>
      <div className="pricing-grid">
        {d.plans.map((p) => (
          <Panel
            className={`pricing-card ${p.popular ? "popular" : ""}`}
            key={p.id}
          >
            {p.popular && (
              <span className="popular-ribbon">
                <Sparkles size={12} />
                THE SWEET SPOT
              </span>
            )}
            <h3>{p.name}</h3>
            <p>{p.tagline}</p>
            <div className="price">
              {money(p.price)}
              <span>/ 30 days</span>
            </div>
            <ul>
              <li>
                <Check size={14} />
                {p.memory / 1024} GB dedicated memory
              </li>
              <li>
                <Check size={14} />
                {p.cpu / 100} vCPU allocation
              </li>
              <li>
                <Check size={14} />
                {p.disk / 1024} GB persistent storage
              </li>
              <li>
                <Check size={14} />
                ZK Autopilot included
              </li>
            </ul>
            <Link
              className={`btn ${p.popular ? "btn-primary" : "btn-secondary"}`}
              to={"/servers/new"}
            >
              Build with {p.name}
              <ArrowUpRight size={15} />
            </Link>
          </Panel>
        ))}
      </div>
      <Panel className="invoices-panel">
        <PanelHeading
          title="Every little transaction"
          subtitle="Your wallet credits, hosting charges, and receipts."
        >
          <select
            aria-label="Filter transactions"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All transactions</option>
            <option value="credit">Wallet credits</option>
            <option value="debit">Hosting charges</option>
          </select>
        </PanelHeading>
        {list.length ? (
          <div className="table-scroll">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => setDetail(i)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setDetail(i);
                    }}
                  >
                    <td>
                      <div className="invoice-name">
                        <span className={`transaction-icon ${i.type}`}>
                          {i.type === "credit" ? (
                            <ArrowDownLeft size={17} />
                          ) : (
                            <ArrowUpRight size={17} />
                          )}
                        </span>
                        <div>
                          <strong>{i.description}</strong>
                          <span>
                            {i.id} · {i.provider}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{date(i.createdAt)}</td>
                    <td>
                      <Badge
                        tone={
                          i.status === "paid"
                            ? "green"
                            : i.status === "pending"
                              ? "amber"
                              : "red"
                        }
                      >
                        {i.status}
                      </Badge>
                    </td>
                    <td className={i.type === "credit" ? "green-text" : ""}>
                      {i.type === "credit" ? "+" : "−"}
                      {money(i.amount)}
                    </td>
                    <td>
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="A fresh ledger"
            description="Your wallet transactions will appear here."
            icon={<ReceiptText size={28} />}
          />
        )}
      </Panel>
      {topup && (
        <Modal
          title="Fuel your next idea"
          description={
            d.mode === "demo"
              ? "Add demo credit to explore the complete hosting and billing flow. No real payment is collected."
              : "Add prepaid hosting credit securely with Stripe."
          }
          onClose={() => setTopup(false)}
        >
          <div className="topup-amounts">
            {[10000, 50000, 100000, 250000].map((v) => (
              <button
                className={amount === v ? "selected" : ""}
                onClick={() => setAmount(v)}
                key={v}
              >
                {money(v)}
                {amount === v && <Check size={15} />}
              </button>
            ))}
          </div>
          <div className="checkout-summary">
            <span>Wallet credit</span>
            <strong>{money(amount)}</strong>
          </div>
          <div className="inline-note">
            <ShieldCheck size={17} />
            {d.mode === "demo"
              ? "Demo funds are stored in your preview workspace. They have no monetary value."
              : "Card details are handled by Stripe. Credit is added only after a signed payment webhook is verified."}
          </div>
          <Button className="full-width" loading={busy} onClick={checkout}>
            {d.mode === "demo" ? (
              <Wallet size={16} />
            ) : (
              <CreditCard size={16} />
            )}{" "}
            {d.mode === "demo"
              ? "Add demo funds"
              : "Continue to secure checkout"}
            <ArrowUpRight size={16} />
          </Button>
        </Modal>
      )}
      {detail && (
        <Modal
          title="Transaction details"
          description={detail.id}
          onClose={() => setDetail(null)}
        >
          <dl className="detail-dl">
            <div>
              <dt>Description</dt>
              <dd>{detail.description}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{money(detail.amount)}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{date(detail.createdAt)}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{detail.provider}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge tone={detail.status === "paid" ? "green" : "amber"}>
                  {detail.status}
                </Badge>
              </dd>
            </div>
          </dl>
          {detail.status === "paid" && (
            <a
              className="btn btn-secondary full-width"
              href={"/api/billing/invoices/" + detail.id + "/receipt"}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={16} />
              Print wallet receipt
            </a>
          )}
          <p className="field-hint">
            A wallet receipt is not a tax invoice. Your hosting provider must
            supply legally compliant tax invoices separately.
          </p>
        </Modal>
      )}
    </div>
  );
}
