import { supabase } from "./supabase";
import type { Lead, LeadStatus } from "../types";

const CUSTOM_STATUS_BASE: Partial<Record<LeadStatus, LeadStatus>> = {
  testou_e_saiu: "stand_by",
  teste_catalogo_7_dias: "testando",
};

export function isCustomLeadStatus(status: LeadStatus) {
  return status in CUSTOM_STATUS_BASE;
}

export function leadStatusBase(status: LeadStatus) {
  return CUSTOM_STATUS_BASE[status] ?? status;
}

export async function applyCustomLeadStatuses<T extends Lead>(leads: T[]): Promise<T[]> {
  if (leads.length === 0) return leads;

  const { data, error } = await supabase
    .from("crm_lead_etapas")
    .select("lead_id,status");

  if (error || !data) return leads;

  const customByLead = new Map(data.map((item) => [item.lead_id, item.status as LeadStatus]));
  return leads.map((lead) => ({ ...lead, status: customByLead.get(lead.id) ?? lead.status }));
}

export async function applyCustomLeadStatus<T extends Lead>(lead: T): Promise<T> {
  const [result] = await applyCustomLeadStatuses([lead]);
  return result;
}

export async function persistLeadStatus(leadId: string, status: LeadStatus) {
  if (isCustomLeadStatus(status)) {
    const { error: leadError } = await supabase.from("leads").update({ status: leadStatusBase(status) }).eq("id", leadId);
    if (leadError) throw leadError;

    const { error: customError } = await supabase
      .from("crm_lead_etapas")
      .upsert({ lead_id: leadId, status }, { onConflict: "lead_id" });
    if (customError) throw customError;
    return;
  }

  const { error: customError } = await supabase.from("crm_lead_etapas").delete().eq("lead_id", leadId);
  if (customError) throw customError;

  const { error: leadError } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (leadError) throw leadError;
}
