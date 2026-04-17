from django.db import models


class Location(models.Model):
    tenant    = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="locations")
    name      = models.CharField("Nome", max_length=120)
    address   = models.CharField("Endereço", max_length=250, blank=True)
    city      = models.CharField("Cidade", max_length=100, blank=True)
    state     = models.CharField("Estado", max_length=50, blank=True)
    timezone  = models.CharField("Fuso horário", max_length=50, default="America/Sao_Paulo")
    is_active = models.BooleanField("Ativo", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Estabelecimento"
        ordering = ["name"]

    def __str__(self):
        return f"{self.tenant} — {self.name}"


class VisitorCount(models.Model):
    camera     = models.ForeignKey("cameras.Camera", on_delete=models.CASCADE, related_name="visitor_counts")
    location   = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True, blank=True, related_name="visitor_counts")
    date       = models.DateField(db_index=True)
    entries    = models.PositiveIntegerField(default=0)
    exits      = models.PositiveIntegerField(default=0)
    peak_hour  = models.PositiveSmallIntegerField(null=True, blank=True)
    peak_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [["camera", "date"]]
        ordering = ["-date"]

    @property
    def inside_now(self):
        return max(0, self.entries - self.exits)
