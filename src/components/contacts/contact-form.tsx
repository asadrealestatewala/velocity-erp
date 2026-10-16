"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { contactSchema, leadDetailsSchema } from "@/lib/validation";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/misc";
import { checkDuplicatesAction, createContactAction, updateContactAction, type DuplicateMatch } from "@/server/actions/contacts";
import { fmtDate } from "@/lib/utils";
import { INQUIRY_TYPES } from "@/lib/constants";

const formSchema = z.object({ contact: contactSchema, lead: leadDetailsSchema.extend({ createLead: z.boolean().default(true) }) });
type FormIn = z.input<typeof formSchema>;
type FormOut = z.output<typeof formSchema>;

type Opt = { id: string; name: string };
type CustomField = { key: string; label: string; type: string; options: unknown };

export function ContactForm({
  mode,
  base,
  contactId,
  initial,
  lookups,
  customFields,
  owners,
  reps,
  dealershipId,
}: {
  mode: "create" | "edit" | "walkin";
  base: string;
  contactId?: string;
  initial?: Partial<FormIn["contact"]>;
  lookups: { cities: (Opt & { provinceId: string })[]; provinces: Opt[]; sources: (Opt & { key: string })[]; models: Opt[] };
  customFields: CustomField[];
  owners?: Opt[];
  reps?: Opt[];
  dealershipId?: string;
}) {
  const router = useRouter();
  const walkInSource = lookups.sources.find((s) => s.key === "WALK_IN")?.id;
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contact: {
        type: "LEAD", country: "Pakistan", consentMarketing: false, communicationPrefs: {}, customFields: {},
        sourceId: mode === "walkin" ? walkInSource : undefined,
        ...initial,
      },
      lead: { createLead: mode !== "edit", inquiryType: mode === "walkin" ? "WALK_IN" : "MANUAL" },
    },
  });
  const { register, handleSubmit, watch, setValue, formState, control } = form;
  const e = formState.errors;
  const [dups, setDups] = useState<{ matches: DuplicateMatch[]; hidden: number } | null>(null);
  const [checked, setChecked] = useState<string>("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState("");

  const provinceId = watch("contact.provinceId");
  const cities = useMemo(() => (provinceId ? lookups.cities.filter((c) => c.provinceId === provinceId) : lookups.cities), [provinceId, lookups.cities]);

  const runDupCheck = async () => {
    const phone = (form.getValues("contact.phone") as string | null | undefined) || null;
    const email = (form.getValues("contact.email") as string | null | undefined) || null;
    const key = `${phone}|${email}`;
    if (key === checked || (!phone && !email)) return dups;
    setChecked(key);
    const r = await checkDuplicatesAction({ phone, email, excludeId: contactId });
    const result = r.ok && r.data ? { matches: r.data.matches, hidden: r.data.hiddenMatchCount } : null;
    setDups(result && (result.matches.length || result.hidden) ? result : null);
    return result && (result.matches.length || result.hidden) ? result : null;
  };

  const submit = async (values: FormOut, opts: { confirmDuplicate?: boolean; attachTo?: string } = {}) => {
    setServerError(null);
    setSubmitting(true);
    try {
      if (mode === "edit") {
        const r = await updateContactAction(contactId!, values.contact, { confirmDuplicate: opts.confirmDuplicate });
        if (!r.ok) {
          setServerError(r.error);
          if (r.error.includes("Confirm")) await runDupCheck();
          return;
        }
        toast.success("Contact saved");
        router.push(`${base}/contacts/${contactId}`);
        router.refresh();
        return;
      }
      const found = opts.confirmDuplicate || opts.attachTo ? dups : await runDupCheck();
      if (found && !opts.confirmDuplicate && !opts.attachTo) {
        setServerError("Possible duplicate found — choose how to continue below.");
        return;
      }
      const r = await createContactAction({
        contact: values.contact,
        lead: values.lead,
        mode: opts.attachTo ? "attach" : "new",
        attachToContactId: opts.attachTo,
        confirmDuplicate: !!opts.confirmDuplicate,
        dealershipId,
        assignedUserId: mode === "walkin" ? assignedUserId || undefined : undefined,
      });
      if (!r.ok) {
        setServerError(r.error);
        return;
      }
      toast.success(r.message ?? "Saved");
      router.push(`${base}/contacts/${r.data!.contactId}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const err = (path: string) => {
    const parts = path.split(".");
    let cur: unknown = e;
    for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
    return (cur as { message?: string } | undefined)?.message;
  };

  return (
    <form
      onSubmit={handleSubmit(
        (v) => submit(v),
        () => {
          setServerError("Please correct the highlighted fields.");
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      )}
      className="space-y-4"
      noValidate
    >
      <FormError error={serverError} />

      {dups && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-900">Possible duplicate</p>
              <p className="text-sm text-amber-800">
                Records with the same normalised phone number or email already exist. Records are never merged automatically.
              </p>
              {dups.matches.length > 0 && (
                <ul className="mt-3 divide-y divide-amber-200 rounded-xl border border-amber-200 bg-white">
                  {dups.matches.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link href={`${base}/contacts/${m.id}`} target="_blank" className="link inline-flex items-center gap-1">
                          {m.name} <ExternalLink className="h-3 w-3" />
                        </Link>
                        <p className="text-xs text-ink-500">
                          {[m.phone, m.email, m.city, m.stage, m.dealership].filter(Boolean).join(" · ")} · created {fmtDate(m.createdAt)}
                          {m.archived && " · archived"}
                        </p>
                      </div>
                      {mode !== "edit" && (
                        <Button size="sm" variant="secondary" onClick={handleSubmit((v) => submit(v, { attachTo: m.id }))}>
                          Add new lead to this contact
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {dups.hidden > 0 && (
                <p className="mt-2 text-xs text-amber-800">
                  {dups.hidden} matching record(s) exist elsewhere in YADEA&apos;s records and aren&apos;t visible to you.
                </p>
              )}
              <div className="mt-3">
                <Button size="sm" variant="outlineBrand" onClick={handleSubmit((v) => submit(v, { confirmDuplicate: true }))}>
                  {mode === "edit" ? "Save anyway" : "Create a separate contact anyway"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="General information" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {mode !== "walkin" && (
            <Field label="Contact type">
              {(p) => (
                <Select {...p} {...register("contact.type")}>
                  <option value="LEAD">Lead</option>
                  <option value="CUSTOMER">Customer</option>
                </Select>
              )}
            </Field>
          )}
          <Field label="Salutation">
            {(p) => (
              <Select {...p} {...register("contact.salutation")}>
                <option value="">—</option>
                {["Mr.", "Mrs.", "Ms.", "Dr."].map((s) => <option key={s}>{s}</option>)}
              </Select>
            )}
          </Field>
          <Field label="First name" required error={err("contact.firstName")}>{(p) => <Input {...p} {...register("contact.firstName")} autoComplete="off" />}</Field>
          <Field label="Last name" error={err("contact.lastName")}>{(p) => <Input {...p} {...register("contact.lastName")} autoComplete="off" />}</Field>
          <Field label="Phone" error={err("contact.phone")} help="Used for duplicate checks">
            {(p) => <Input {...p} type="tel" placeholder="+92 3xx xxxxxxx" {...register("contact.phone", { onBlur: () => void runDupCheck() })} />}
          </Field>
          <Field label="Email" error={err("contact.email")}>{(p) => <Input {...p} type="email" {...register("contact.email", { onBlur: () => void runDupCheck() })} />}</Field>
          <Field label="Alternate phone">{(p) => <Input {...p} {...register("contact.alternatePhone")} />}</Field>
          <Field label="Date of birth" error={err("contact.dateOfBirth")}>
            {(p) => <Input {...p} type="date" {...register("contact.dateOfBirth")} />}
          </Field>
          <Field label="Gender">
            {(p) => (
              <Select {...p} {...register("contact.gender")}>
                <option value="">—</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option>
              </Select>
            )}
          </Field>
          <Field label="Profession">{(p) => <Input {...p} {...register("contact.profession")} />}</Field>
          <Field label="Business name">{(p) => <Input {...p} {...register("contact.businessName")} />}</Field>
          <Field label="Website" error={err("contact.website")}>{(p) => <Input {...p} placeholder="https://" {...register("contact.website")} />}</Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Address" className="sm:col-span-2">{(p) => <Input {...p} {...register("contact.address")} />}</Field>
          <Field label="Province / state">
            {(p) => (
              <Select {...p} {...register("contact.provinceId", { onChange: () => setValue("contact.cityId", "") })}>
                <option value="">—</option>
                {lookups.provinces.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="City">
            {(p) => (
              <Select {...p} {...register("contact.cityId")}>
                <option value="">—</option>
                {cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Postal code">{(p) => <Input {...p} {...register("contact.postalCode")} />}</Field>
          <Field label="Country">{(p) => <Input {...p} {...register("contact.country")} />}</Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Source, ownership & consent" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Contact source" help={mode === "edit" ? "Changing it is logged; the lead's original attribution is preserved." : undefined}>
            {(p) => (
              <Select {...p} {...register("contact.sourceId")}>
                <option value="">—</option>
                {lookups.sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            )}
          </Field>
          {owners && (
            <Field label="Lead owner">
              {(p) => (
                <Select {...p} {...register("contact.ownerId")}>
                  <option value="">Me</option>
                  {owners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Field label="Preferred contact method">
            {(p) => (
              <Select {...p} {...register("contact.preferredContactMethod")}>
                <option value="">—</option><option value="phone">Phone call</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option>
              </Select>
            )}
          </Field>
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <p className="label">Communication preferences</p>
            {(["phone", "whatsapp", "sms", "email"] as const).map((k) => (
              <Controller key={k} control={control} name={`contact.communicationPrefs.${k}`} render={({ field }) => (
                <Checkbox label={`OK to contact by ${k === "whatsapp" ? "WhatsApp" : k.toUpperCase() === "SMS" ? "SMS" : k}`} checked={!!field.value} onChange={(ev) => field.onChange(ev.target.checked)} />
              )} />
            ))}
          </div>
          <Controller control={control} name="contact.consentMarketing" render={({ field }) => (
            <Checkbox className="sm:col-span-2 lg:col-span-4" label="Customer has consented to marketing communication (consent date is recorded)" checked={!!field.value} onChange={(ev) => field.onChange(ev.target.checked)} />
          )} />
        </div>
      </Card>

      {customFields.length > 0 && (
        <Card>
          <CardHeader title="Additional fields" description="Configured by administrators in Settings → Custom fields" />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {customFields.map((cf) => (
              <Controller key={cf.key} control={control} name={`contact.customFields.${cf.key}`} render={({ field }) =>
                cf.type === "CHECKBOX" ? (
                  <Checkbox className="mt-6" label={cf.label} checked={!!field.value} onChange={(ev) => field.onChange(ev.target.checked)} />
                ) : cf.type === "SELECT" ? (
                  <Field label={cf.label}>{(p) => (
                    <Select {...p} value={(field.value as string) ?? ""} onChange={(ev) => field.onChange(ev.target.value || null)}>
                      <option value="">—</option>
                      {(Array.isArray(cf.options) ? (cf.options as string[]) : []).map((o) => <option key={o}>{o}</option>)}
                    </Select>
                  )}</Field>
                ) : cf.type === "TEXTAREA" ? (
                  <Field label={cf.label} className="sm:col-span-2">{(p) => <Textarea {...p} value={(field.value as string) ?? ""} onChange={(ev) => field.onChange(ev.target.value)} />}</Field>
                ) : (
                  <Field label={cf.label}>{(p) => <Input {...p} type={cf.type === "NUMBER" ? "number" : cf.type === "DATE" ? "date" : "text"} value={(field.value as string) ?? ""} onChange={(ev) => field.onChange(ev.target.value)} />}</Field>
                )
              } />
            ))}
          </div>
        </Card>
      )}

      {mode !== "edit" && (
        <Card>
          <CardHeader
            title={mode === "walkin" ? "Walk-in lead details" : "Lead details"}
            description={mode === "walkin" ? "This lead is recorded as a dealership walk-in and stays with your dealership." : "A lead tracks this inquiry through the sales pipeline."}
            action={mode === "create" ? (
              <Controller control={control} name="lead.createLead" render={({ field }) => <Checkbox label="Create a lead" checked={!!field.value} onChange={(ev) => field.onChange(ev.target.checked)} />} />
            ) : undefined}
          />
          {(mode === "walkin" || watch("lead.createLead")) && (
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Interested bike model">
                {(p) => (
                  <Select {...p} {...register("lead.interestedModelId")}>
                    <option value="">—</option>
                    {lookups.models.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                )}
              </Field>
              {mode === "create" && (
                <Field label="Inquiry type">
                  {(p) => (
                    <Select {...p} {...register("lead.inquiryType")}>
                      {Object.entries(INQUIRY_TYPES).filter(([k]) => k !== "WALK_IN").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Next follow-up" error={err("lead.nextFollowUpAt")}>{(p) => <Input {...p} type="datetime-local" {...register("lead.nextFollowUpAt")} />}</Field>
              {mode === "walkin" && reps && reps.length > 0 && (
                <Field label="Sales representative">
                  {(p) => (
                    <Select {...p} value={assignedUserId} onChange={(ev) => setAssignedUserId(ev.target.value)}>
                      <option value="">Unassigned (manager decides)</option>
                      {reps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Campaign">{(p) => <Input {...p} {...register("lead.campaign")} />}</Field>
              <Field label="Referral details">{(p) => <Input {...p} {...register("lead.referralDetails")} />}</Field>
              <Field label="Inquiry description" className="sm:col-span-2 lg:col-span-4">{(p) => <Textarea {...p} rows={3} {...register("lead.description")} />}</Field>
            </div>
          )}
        </Card>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-ink-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={submitting}>{mode === "edit" ? "Save changes" : mode === "walkin" ? "Create walk-in lead" : "Create contact"}</Button>
      </div>
    </form>
  );
}
