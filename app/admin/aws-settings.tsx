"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Cloud, KeyRound, MailCheck, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";

type AwsSettings = {
    configured: boolean;
    encryptionKeyConfigured: boolean;
    accessKeyHint: string | null;
    region: string;
    outputFormat: "json" | "yaml" | "yaml-stream" | "text" | "table";
    senderEmail: string;
    updatedAt: string | null;
};

export default function AwsSettingsPanel() {
    const [settings, setSettings] = useState<AwsSettings | null>(null);
    const [accessKeyId, setAccessKeyId] = useState("");
    const [secretAccessKey, setSecretAccessKey] = useState("");
    const [region, setRegion] = useState("us-east-1");
    const [outputFormat, setOutputFormat] = useState<AwsSettings["outputFormat"]>("json");
    const [senderEmail, setSenderEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    useEffect(() => {
        let active = true;
        fetch("/api/admin/aws-config", { cache: "no-store" })
            .then(async (response) => response.ok ? await response.json() as { settings: AwsSettings } : null)
            .then((result) => {
                if (!active || !result) return;
                setSettings(result.settings);
                setRegion(result.settings.region);
                setOutputFormat(result.settings.outputFormat);
                setSenderEmail(result.settings.senderEmail);
            })
            .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load AWS settings."); })
            .finally(() => { if (active) setBusy(false); });
        return () => { active = false; };
    }, []);

    async function saveSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const response = await fetch("/api/admin/aws-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessKeyId, secretAccessKey, region, outputFormat, senderEmail }),
            });
            const result = await response.json() as { settings?: AwsSettings; error?: string };
            if (!response.ok || !result.settings) throw new Error(result.error ?? "Could not save AWS settings.");
            setSettings(result.settings);
            setAccessKeyId("");
            setSecretAccessKey("");
            setMessage("AWS settings saved. Secret credentials will not be shown again.");
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not save AWS settings.");
        } finally {
            setBusy(false);
        }
    }

    async function testConnection() {
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const response = await fetch("/api/admin/aws-config/test", { method: "POST" });
            const result = await response.json() as { message?: string; error?: string; sandboxMode?: boolean };
            if (!response.ok) throw new Error(result.error ?? "AWS SES connection test failed.");
            setMessage(result.message ?? "AWS SES connection verified.");
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "AWS SES connection test failed.");
        } finally {
            setBusy(false);
        }
    }

    async function verifySender() {
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const response = await fetch("/api/admin/aws-config/verify-sender", { method: "POST" });
            const result = await response.json() as { message?: string; error?: string };
            if (!response.ok) throw new Error(result.error ?? "Could not request SES sender verification.");
            setMessage(result.message ?? "SES sender verification requested.");
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not request SES sender verification.");
        } finally {
            setBusy(false);
        }
    }

    async function disconnect() {
        if (!window.confirm("Remove the saved AWS credentials and SES configuration?")) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const response = await fetch("/api/admin/aws-config", { method: "DELETE" });
            const result = await response.json() as { settings?: AwsSettings; error?: string };
            if (!response.ok || !result.settings) throw new Error(result.error ?? "Could not remove AWS settings.");
            setSettings(result.settings);
            setSenderEmail("");
            setMessage("AWS settings removed.");
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not remove AWS settings.");
        } finally {
            setBusy(false);
        }
    }

    return <div className="aws-settings-page">
        <section className="aws-settings-intro">
            <div className="aws-settings-icon"><Cloud size={20} /></div>
            <div><p className="admin-kicker">AWS INTEGRATION</p><h2>Connect Amazon SES</h2><p>Use SES to deliver signup verification codes. Saved region and output preferences are available for future AWS integrations.</p></div>
            <span className={`aws-connection-state${settings?.configured ? " connected" : ""}`}><span />{settings?.configured ? "Configured" : "Not connected"}</span>
        </section>

        <form className="aws-settings-form" onSubmit={saveSettings}>
            <div className="aws-form-heading"><div><p className="admin-kicker"><KeyRound size={13} /> CREDENTIALS</p><h3>AWS access</h3></div>{settings?.accessKeyHint && <span className="aws-key-hint">Saved key {settings.accessKeyHint}</span>}</div>
            {!settings?.encryptionKeyConfigured && <div className="aws-config-warning" role="alert"><ShieldCheck size={16} /><span>The app could not create its private encryption key. Check that the server can write to its data directory before saving credentials.</span></div>}
            <div className="aws-form-grid">
                <label>Access key ID<input autoComplete="off" spellCheck={false} maxLength={128} required={!settings?.configured} value={accessKeyId} onChange={(event) => setAccessKeyId(event.target.value)} placeholder={settings?.configured ? "Leave blank to keep current key" : "AKIA…"} /></label>
                <label>Secret access key<input type="password" autoComplete="new-password" maxLength={256} required={!settings?.configured} value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.target.value)} placeholder={settings?.configured ? "Leave blank to keep current secret" : "Enter secret key"} /></label>
                <label>Default region<input required maxLength={32} value={region} onChange={(event) => setRegion(event.target.value)} placeholder="us-east-1" /></label>
                <label>Default CLI output<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as AwsSettings["outputFormat"])}><option value="json">JSON</option><option value="yaml">YAML</option><option value="yaml-stream">YAML stream</option><option value="text">Text</option><option value="table">Table</option></select></label>
                <label className="aws-sender-field">Verified SES sender email<input required type="email" maxLength={254} autoComplete="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} placeholder="store@example.com" /></label>
            </div>
            <p className="aws-secret-note"><ShieldCheck size={14} />Credentials are encrypted at rest with AES-256-GCM. A private app key is generated automatically and stored with restricted file permissions; the secret is write-only and never returned to this page.</p>
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="aws-success" role="status"><Check size={14} />{message}</p>}
            <div className="aws-form-actions"><button className="aws-save-button" type="submit" disabled={busy || !settings?.encryptionKeyConfigured}><Save size={15} />{busy ? "Working…" : "Save AWS settings"}</button><button className="aws-test-button" type="button" onClick={verifySender} disabled={busy || !settings?.configured}><MailCheck size={15} />Create SES identity</button><button className="aws-test-button" type="button" onClick={testConnection} disabled={busy || !settings?.configured}><RefreshCw size={15} />Test SES identity</button>{settings?.configured && <button className="aws-disconnect-button" type="button" onClick={disconnect} disabled={busy}><Trash2 size={15} />Remove</button>}</div>
        </form>
        <p className="aws-settings-footnote">The app uses the AWS SDK directly; the CLI output format is stored as a preference and does not write to the server&apos;s <code>~/.aws</code> files. Keep <code>data/.storefront-secrets-key</code> with the app&apos;s persistent data and protect backups; losing it requires re-entering AWS credentials. For production, prefer an IAM role when the hosting platform supports it.</p>
    </div>;
}