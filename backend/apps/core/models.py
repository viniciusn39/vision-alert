from django.db import models


class SystemConfig(models.Model):
    """Configurações do sistema editáveis via painel admin"""
    key         = models.CharField("Chave", max_length=100, unique=True)
    value       = models.CharField("Valor", max_length=500)
    label       = models.CharField("Nome", max_length=200)
    description = models.CharField("Descrição", max_length=500, blank=True)
    value_type  = models.CharField("Tipo", max_length=10, default="str",
                                   choices=[("str","Texto"),("int","Inteiro"),("float","Decimal"),("bool","Booleano")])
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração"
        verbose_name_plural = "Configurações do Sistema"
        ordering = ["key"]

    def __str__(self):
        return f"{self.key} = {self.value}"

    @classmethod
    def get(cls, key, default=None):
        try:
            obj = cls.objects.get(key=key)
            if obj.value_type == "int":   return int(obj.value)
            if obj.value_type == "float": return float(obj.value)
            if obj.value_type == "bool":  return obj.value.lower() in ("1","true","yes")
            return obj.value
        except cls.DoesNotExist:
            return default

    @classmethod
    def get_all(cls):
        return {obj.key: obj for obj in cls.objects.all()}
