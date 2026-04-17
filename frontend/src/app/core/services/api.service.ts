import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Camera, AlertRule, Alert, DashboardStats, AdminDashboard,
  Plan, Partner, Tenant, TenantSettings, Invoice,
  PaginatedResponse, User
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private b    = environment.apiUrl;
  private p(o: Record<string,string> = {}) { return new HttpParams({ fromObject: o }); }

  // Auth
  login(email: string, password: string) {
    return this.http.post<{access:string;refresh:string}>(`${this.b}/auth/login/`, {email, password});
  }
  me() { return this.http.get<User>(`${this.b}/auth/me/`); }
  changePassword(old_password: string, new_password: string) {
    return this.http.post(`${this.b}/auth/change-password/`, {old_password, new_password});
  }

  // Public
  getPlans() { return this.http.get<Plan[]>(`${this.b}/tenants/plans/`); }
  register(data: any) { return this.http.post(`${this.b}/tenants/register/`, data); }

  // Tenant
  getProfile() { return this.http.get<Tenant>(`${this.b}/tenants/profile/`); }
  updateProfile(data: any) { return this.http.patch<Tenant>(`${this.b}/tenants/profile/`, data); }
  getSettings() { return this.http.get<TenantSettings>(`${this.b}/tenants/settings/`); }
  updateSettings(data: any) { return this.http.patch<TenantSettings>(`${this.b}/tenants/settings/`, data); }
  getDashboard() { return this.http.get<DashboardStats>(`${this.b}/dashboard/stats/`); }

  // Users
  getUsers() { return this.http.get<User[]>(`${this.b}/auth/users/`); }
  createUser(data: any) { return this.http.post<User>(`${this.b}/auth/users/`, data); }
  updateUser(id: number, data: any) { return this.http.patch<User>(`${this.b}/auth/users/${id}/`, data); }
  deleteUser(id: number) { return this.http.delete(`${this.b}/auth/users/${id}/`); }

  // Video upload
  uploadVideo(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{path: string, filename: string, size: number}>(`${this.b}/cameras/upload-video/`, fd);
  }

  // Locations
  getLocations()                  { return this.http.get<any[]>(`${this.b}/locations/`); }
  createLocation(d: any)          { return this.http.post<any>(`${this.b}/locations/`, d); }
  updateLocation(id: number, d: any) { return this.http.put<any>(`${this.b}/locations/${id}/`, d); }
  deleteLocation(id: number)      { return this.http.delete(`${this.b}/locations/${id}/`); }
  getLocationStats(id: number)    { return this.http.get<any>(`${this.b}/locations/${id}/stats/`); }
  getVisitorCounts(params: any={}) { return this.http.get<any[]>(`${this.b}/visitor-counts/`, {params: this.p(params)}); }

  getCameraStreamUrl(id: number, token: string) { return `${this.b}/cameras/${id}/stream/?token=${token}`; }
  getCameraDetail(id: number) { return this.http.get<any>(`${this.b}/cameras/${id}/detail/`); }

  // System metrics
  getSystemMetrics() { return this.http.get<any>(`${this.b}/system/metrics/`); }

  // System config
  getSystemConfig() { return this.http.get<any[]>(`${this.b}/system/config/`); }
  updateSystemConfig(data: Record<string,any>) { return this.http.patch<any>(`${this.b}/system/config/`, data); }

  downloadYoutube(url: string) {
    return this.http.post<{path: string, filename: string, size: number}>(`${this.b}/cameras/youtube-download/`, {url});
  }

  // Cameras
  getCameras(p: Record<string,string> = {}) { return this.http.get<Camera[]>(`${this.b}/cameras/`, {params: this.p(p)}); }
  createCamera(d: any) { return this.http.post<Camera>(`${this.b}/cameras/`, d); }
  updateCamera(id: number, d: any) { return this.http.patch<Camera>(`${this.b}/cameras/${id}/`, d); }
  deleteCamera(id: number) { return this.http.delete(`${this.b}/cameras/${id}/`); }
  startCamera(id: number) { return this.http.post(`${this.b}/cameras/${id}/start/`, {}); }
  stopCamera(id: number)  { return this.http.post(`${this.b}/cameras/${id}/stop/`, {}); }

  // Rules
  getRules(p: Record<string,string> = {}) { return this.http.get<AlertRule[]>(`${this.b}/alert-rules/`, {params: this.p(p)}); }
  createRule(d: any)  { return this.http.post<AlertRule>(`${this.b}/alert-rules/`, d); }
  updateRule(id: number, d: any) { return this.http.patch<AlertRule>(`${this.b}/alert-rules/${id}/`, d); }
  deleteRule(id: number) { return this.http.delete(`${this.b}/alert-rules/${id}/`); }
  toggleRule(id: number) { return this.http.post<{is_active:boolean}>(`${this.b}/alert-rules/${id}/toggle/`, {}); }

  // Alerts
  getAlerts(p: Record<string,string> = {}) { return this.http.get<PaginatedResponse<Alert>>(`${this.b}/alerts/`, {params: this.p(p)}); }
  getAlertStats() { return this.http.get<any>(`${this.b}/alerts/stats/`); }
  acknowledgeAlert(id: number) { return this.http.post(`${this.b}/alerts/${id}/acknowledge/`, {}); }
  resolveAlert(id: number) { return this.http.post(`${this.b}/alerts/${id}/resolve/`, {}); }

  // Billing
  getInvoices() { return this.http.get<Invoice[]>(`${this.b}/billing/invoices/`); }
  getSubscription() { return this.http.get<any>(`${this.b}/billing/subscription/`); }
  activateSubscription(payment_method: string) { return this.http.post(`${this.b}/billing/subscription/`, {payment_method}); }

  // Superadmin
  adminDashboard() { return this.http.get<AdminDashboard>(`${this.b}/admin/dashboard/`); }
  adminTenants(p: Record<string,string> = {}) { return this.http.get<PaginatedResponse<Tenant>>(`${this.b}/admin/tenants/`, {params: this.p(p)}); }
  adminGetTenant(id: number) { return this.http.get<Tenant>(`${this.b}/admin/tenants/${id}/`); }
  adminSuspendTenant(id: number) { return this.http.post(`${this.b}/admin/tenants/${id}/suspend/`, {}); }
  adminActivateTenant(id: number) { return this.http.post(`${this.b}/admin/tenants/${id}/activate/`, {}); }
  adminChangePlan(id: number, plan_id: number) { return this.http.post(`${this.b}/admin/tenants/${id}/change_plan/`, {plan_id}); }
  adminPartners(p: Record<string,string> = {}) { return this.http.get<PaginatedResponse<Partner>>(`${this.b}/admin/partners/`, {params: this.p(p)}); }
  adminCreatePartner(d: any) { return this.http.post<Partner>(`${this.b}/admin/partners/`, d); }
  adminUpdatePartner(id: number, d: any) { return this.http.patch<Partner>(`${this.b}/admin/partners/${id}/`, d); }
  adminPlans() { return this.http.get<Plan[]>(`${this.b}/admin/plans/`); }
  adminCreatePlan(d: any) { return this.http.post<Plan>(`${this.b}/admin/plans/`, d); }
  adminUpdatePlan(id: number, d: any) { return this.http.patch<Plan>(`${this.b}/admin/plans/${id}/`, d); }
  adminInvoices(p: Record<string,string> = {}) { return this.http.get<PaginatedResponse<Invoice>>(`${this.b}/billing/admin/invoices/`, {params: this.p(p)}); }

  // Partner
  partnerDashboard() { return this.http.get<any>(`${this.b}/partner/dashboard/`); }
  // Fleet
  getFleetDevices() { return this.http.get<any[]>(`${this.b}/fleet/admin/devices/`); }
  getDeviceLogs(id: string) { return this.http.get<any[]>(`${this.b}/fleet/admin/devices/${id}/logs/`); }
  provisionDevice(d: any) { return this.http.post<any>(`${this.b}/fleet/admin/provision/`, d); }

  partnerClients()   { return this.http.get<Tenant[]>(`${this.b}/partner/clients/`); }
}
