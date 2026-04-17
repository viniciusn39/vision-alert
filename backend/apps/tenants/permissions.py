from rest_framework.permissions import BasePermission

def get_tenant(request):
    user = getattr(request, "user", None)
    if user and user.is_authenticated and user.tenant_id:
        if not hasattr(request, "_tenant_obj") or request._tenant_obj is None:
            request._tenant_obj = user.tenant
        return request._tenant_obj
    return None

class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "superadmin"

class IsPartnerAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "partner_admin"

class IsTenantAdmin(BasePermission):
    def has_permission(self, request, view):
        t = get_tenant(request)
        if t: request.tenant = t
        return request.user.is_authenticated and request.user.role in ["superadmin","tenant_admin"] and (t is not None or request.user.role == "superadmin")

class IsTenantMember(BasePermission):
    ROLES = ["superadmin","tenant_admin","tenant_operator","tenant_viewer"]
    def has_permission(self, request, view):
        t = get_tenant(request)
        if t: request.tenant = t
        return request.user.is_authenticated and request.user.role in self.ROLES and t is not None

class IsTenantOperatorOrAbove(BasePermission):
    ALLOWED = ["superadmin","tenant_admin","tenant_operator"]
    def has_permission(self, request, view):
        t = get_tenant(request)
        if t: request.tenant = t
        return request.user.is_authenticated and request.user.role in self.ALLOWED

class IsSuperAdminOrPartner(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ["superadmin","partner_admin"]
