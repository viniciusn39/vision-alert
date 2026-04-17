export interface User {
  id: number; email: string; name: string; role: string; is_active: boolean; created_at: string;
}

export interface Plan {
  id: number; name: string; display_name: string; price: number;
  max_cameras: number; max_users: number; max_rules: number;
  trial_days: number; features: Record<string, boolean>; sort_order: number;
}

export interface Partner {
  id: number; company_name: string; cnpj: string; email: string; phone: string;
  commission_rate: number; is_active: boolean; clients_count: number; created_at: string;
}

export interface Tenant {
  id: number; company_name: string; cnpj: string; phone: string; email: string;
  plan: number; plan_name: string; partner: number | null; partner_name: string;
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  trial_ends_at: string | null; cameras_count: number; users_count: number;
  rules_count: number; is_active_or_trial: boolean; created_at: string;
}

export interface TenantSettings {
  id?: number; telegram_token?: string; telegram_chat_id?: string;
  alert_email?: string; whatsapp_number?: string; logo_url?: string;
}

export interface Camera {
  id: number; name: string; location: string; url: string;
  protocol: string; is_active: boolean; status: string;
  last_seen: string | null; snapshot_url: string | null; created_at: string;
}

export interface AlertRule {
  id: number; name: string; behavior: string; behavior_display: string;
  cameras: number[]; severity: string; severity_display: string;
  is_active: boolean; params: Record<string, any>; channels: string[];
  cooldown_seconds: number; created_at: string;
}

export interface Alert {
  id: number; rule: number; rule_name: string; rule_severity: string;
  behavior: string; camera: number; camera_name: string; camera_location: string;
  status: string; description: string; snapshot_url: string | null;
  detection_data: Record<string, any>; triggered_at: string;
  resolved_at: string | null; notified: boolean;
}

export interface Invoice {
  id: number; tenant: number; tenant_name: string; amount: number;
  due_date: string; status: string; status_display: string;
  payment_method: string; method_display: string;
  boleto_url: string; boleto_barcode: string;
  pix_qrcode: string; pix_copy_paste: string; paid_at: string | null; created_at: string;
}

export interface DashboardStats {
  cameras: { total: number; online: number; offline: number; alert: number };
  alerts:  { today: number; critical_today: number; open: number };
  rules:   { active: number; total: number };
  plan:    { name: string; max_cameras: number; max_users: number; max_rules: number; used_cameras: number; used_users: number; used_rules: number };
  tenant:  { status: string; trial_ends_at: string | null };
}

export interface AdminDashboard {
  tenants:  { total: number; trial: number; active: number; suspended: number };
  partners: { total: number; active: number };
  mrr: number;
  invoices: { pending: number; overdue: number };
}

export interface AuthPayload {
  name: string; email: string; role: string;
  tenant_id: number | null; partner_id: number | null;
  plan: string | null; tenant_status: string | null;
  trial_ends_at: string | null; company_name: string | null;
}

export interface PaginatedResponse<T> {
  count: number; next: string | null; previous: string | null; results: T[];
}
