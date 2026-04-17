import random
from datetime import timedelta, date
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


class Command(BaseCommand):
    help = "Seed rich test data for VisionAlert"

    def handle(self, *args, **options):
        self._plans()
        self._superadmin()
        self._partners()
        self._tenants()
        self._periodic_tasks()
        self._print_summary()

    def _plans(self):
        from apps.tenants.models import Plan
        plans = [
            # Free trial
            dict(name="free", display_name="Free Trial", price=0, max_cameras=2, max_users=2, max_rules=3, trial_days=30, sort_order=0, features={"mode": "cloud"}, is_active=True),
            # Cloud — preco por camera (R$ 65/60/55)
            dict(name="cloud_8", display_name="Cloud 8-15 cam", price=65, max_cameras=15, max_users=10, max_rules=50, trial_days=0, sort_order=1, features={"mode": "cloud", "per_camera": True}, is_active=True),
            dict(name="cloud_16", display_name="Cloud 16-30 cam", price=60, max_cameras=30, max_users=15, max_rules=100, trial_days=0, sort_order=2, features={"mode": "cloud", "per_camera": True}, is_active=True),
            dict(name="cloud_31", display_name="Cloud 31+ cam", price=55, max_cameras=200, max_users=30, max_rules=999, trial_days=0, sort_order=3, features={"mode": "cloud", "per_camera": True}, is_active=True),
            # Edge — preco por camera (R$ 95/90/85)
            dict(name="edge_8", display_name="Edge 8-15 cam", price=95, max_cameras=15, max_users=10, max_rules=50, trial_days=0, sort_order=4, features={"mode": "edge", "per_camera": True, "realtime": True}, is_active=True),
            dict(name="edge_16", display_name="Edge 16-30 cam", price=90, max_cameras=30, max_users=15, max_rules=100, trial_days=0, sort_order=5, features={"mode": "edge", "per_camera": True, "realtime": True}, is_active=True),
            dict(name="edge_31", display_name="Edge 31+ cam", price=85, max_cameras=200, max_users=30, max_rules=999, trial_days=0, sort_order=6, features={"mode": "edge", "per_camera": True, "realtime": True}, is_active=True),
        ]
        for p in plans:
            Plan.objects.update_or_create(name=p["name"], defaults=p)
        self.stdout.write(self.style.SUCCESS("  planos ok"))

    def _superadmin(self):
        if not User.objects.filter(email="admin@visionalert.com.br").exists():
            User.objects.create_superuser(email="admin@visionalert.com.br", password="admin123", name="Super Admin", role=User.SUPERADMIN)
        self.stdout.write(self.style.SUCCESS("  superadmin ok"))

    def _partners(self):
        from apps.tenants.models import Partner
        data = [
            ("TechSeg Revendas",     "contato@techseg.com.br",    "11999110001", "11.222.333/0001-01", 10,  True),
            ("Vigile Distribuidora", "vendas@vigile.com.br",      "21999110002", "22.333.444/0001-02", 12,  True),
            ("SafeNet Partners",     "parceria@safenet.com.br",   "31999110003", "33.444.555/0001-03", 8,   True),
            ("Monitor Brasil",       "monitor@monitorbrasil.com", "41999110004", "44.555.666/0001-04", 15,  True),
            ("CCTV Pro Revenda",     "cctv@cctvpro.com.br",       "51999110005", "55.666.777/0001-05", 10,  False),
        ]
        for name, email, phone, cnpj, commission, active in data:
            p, created = Partner.objects.get_or_create(email=email, defaults=dict(
                company_name=name, phone=phone, cnpj=cnpj, commission_rate=commission, is_active=active
            ))
            if created and not User.objects.filter(email=email).exists():
                User.objects.create_user(email=email, password="partner123", name=f"Admin {name}", role=User.PARTNER_ADMIN, partner=p)
        self.stdout.write(self.style.SUCCESS("  parceiros ok"))

    def _tenants(self):
        from apps.tenants.models import Plan, Partner, Tenant, TenantSettings
        free = Plan.objects.get(name="free")
        starter = Plan.objects.get(name="starter")
        pro = Plan.objects.get(name="pro")
        ent = Plan.objects.get(name="enterprise")
        p1 = Partner.objects.get(email="contato@techseg.com.br")
        p2 = Partner.objects.get(email="vendas@vigile.com.br")
        p3 = Partner.objects.get(email="parceria@safenet.com.br")

        tenants = [
            ("Empresa Demo",           "cliente@demo.com",          pro,     p1, Tenant.ACTIVE,    "12.345.678/0001-90", "11988880001"),
            ("Supermercado Bahia",     "seg@superbahia.com.br",     pro,     p1, Tenant.ACTIVE,    "23.456.789/0001-01", "71988880002"),
            ("Industria Metalica SA",  "ti@industria.com.br",       ent,     p2, Tenant.ACTIVE,    "34.567.890/0001-02", "31988880003"),
            ("Shopping Norte",         "seg@shoppingnorte.com",     starter, p2, Tenant.ACTIVE,    "45.678.901/0001-03", "11988880004"),
            ("Posto Silva",            "admin@postosilva.com.br",   starter, p3, Tenant.TRIAL,     "56.789.012/0001-04", "21988880005"),
            ("Escola Futuro",          "ti@escolafuturo.edu.br",    free,    None, Tenant.ACTIVE,  "67.890.123/0001-05", "41988880006"),
            ("Clinica Saude Total",    "admin@clinicasaude.com",    pro,     p3, Tenant.SUSPENDED, "78.901.234/0001-06", "85988880007"),
            ("Hotel Praia Azul",       "seg@hotelpraia.com.br",     starter, None, Tenant.TRIAL,   "89.012.345/0001-07", "81988880008"),
        ]

        for name, email, plan, partner, status, cnpj, phone in tenants:
            t, created = Tenant.objects.get_or_create(email=email, defaults=dict(
                company_name=name, plan=plan, partner=partner, status=status, cnpj=cnpj, phone=phone
            ))
            if not created:
                continue
            TenantSettings.objects.get_or_create(tenant=t)
            self._users(t, email)
            self._cameras(t)
            self._rules(t)
            self._alerts(t)
            if status == Tenant.ACTIVE:
                self._billing(t)

        self.stdout.write(self.style.SUCCESS(f"  {len(tenants)} clientes ok"))

    def _users(self, tenant, main_email):
        domain = main_email.split("@")[1]
        is_demo = main_email == "cliente@demo.com"
        users = [
            ("cliente@demo.com" if is_demo else f"admin@{domain}",    "Admin",    User.TENANT_ADMIN,    "cliente123" if is_demo else "admin123"),
            ("operador@demo.com" if is_demo else f"oper@{domain}",    "Operador", User.TENANT_OPERATOR, "operador123" if is_demo else "oper123"),
            ("viewer@demo.com"  if is_demo else f"viewer@{domain}",   "Viewer",   User.TENANT_VIEWER,   "viewer123"),
        ]
        for email, role_label, role, pwd in users:
            if not User.objects.filter(email=email).exists():
                User.objects.create_user(email=email, password=pwd, name=f"{role_label} {tenant.company_name}", role=role, tenant=tenant)

    def _cameras(self, tenant):
        from apps.cameras.models import Camera
        presets = {
            "Supermercado Bahia":    [("Entrada","Portaria","rtsp://10.1.1.10:554/s1","online"),("Caixas","Interno","rtsp://10.1.1.11:554/s1","online"),("Estacionamento","Externo","rtsp://10.1.1.12:554/s1","online"),("Deposito","Interno","rtsp://10.1.1.13:554/s1","offline"),("Corredor","Interno","rtsp://10.1.1.14:554/s1","online")],
            "Industria Metalica SA": [("Portao","Portaria","rtsp://10.2.1.10:554/s1","online"),("Producao A","Producao","rtsp://10.2.1.11:554/s1","online"),("Producao B","Producao","rtsp://10.2.1.12:554/s1","alert"),("Almox","Deposito","rtsp://10.2.1.13:554/s1","online"),("Refeitorio","Interno","rtsp://10.2.1.14:554/s1","offline"),("Estac Func","Externo","rtsp://10.2.1.15:554/s1","online")],
            "Shopping Norte":        [("Entrada A","Portaria","rtsp://10.3.1.10:554/s1","online"),("Entrada B","Portaria","rtsp://10.3.1.11:554/s1","online"),("Praca Alim","Interno","rtsp://10.3.1.12:554/s1","online"),("Estac","Externo","rtsp://10.3.1.13:554/s1","offline"),("Admin","Interno","rtsp://10.3.1.14:554/s1","online")],
        }
        default = [("Entrada principal","Portaria","rtsp://192.168.1.100:554/s1","online"),("Estacionamento","Externo","rtsp://192.168.1.101:554/s1","online"),("Corredor","Interno","rtsp://192.168.1.102:554/s1","offline"),("Servidores","TI","rtsp://192.168.1.103:554/s1","online")]
        for name, loc, url, status in presets.get(tenant.company_name, default):
            Camera.objects.get_or_create(tenant=tenant, name=name, defaults=dict(
                location=loc, url=url, protocol="rtsp", status=status,
                is_active=(status != "offline"),
                last_seen=timezone.now() - timedelta(minutes=random.randint(0,30)) if status != "offline" else None
            ))

    def _rules(self, tenant):
        from apps.alerts.models import AlertRule
        from apps.cameras.models import Camera
        cams = list(Camera.objects.filter(tenant=tenant))
        rules = [
            ("Zona restrita",       "restricted_zone", "critical", ["telegram","email"], 60,  {"zones":[]}),
            ("Aglomeracao",         "crowding",        "high",     ["telegram"],          90,  {"crowd_count":5}),
            ("Permanencia longa",   "loitering",       "high",     ["email"],             120, {"loitering_seconds":300}),
            ("Movimento noturno",   "night_movement",  "critical", ["telegram","email"],  30,  {"schedule_start":22,"schedule_end":6}),
            ("Detec movimento",     "motion",          "low",      ["email"],             300, {}),
        ]
        if tenant.plan.max_rules >= 10:
            rules += [
                ("Queda detectada",  "fall_detection", "critical", ["telegram","email"], 30, {}),
                ("Ausencia EPI",     "missing_ppe",    "high",     ["telegram"],          60, {}),
            ]
        for name, behavior, severity, channels, cooldown, params in rules:
            rule, created = AlertRule.objects.get_or_create(tenant=tenant, name=name, defaults=dict(
                behavior=behavior, severity=severity, channels=channels,
                cooldown_seconds=cooldown, params=params, is_active=True, webhook_url=""
            ))
            if created and cams:
                rule.cameras.set(random.sample(cams, min(2, len(cams))))

    def _alerts(self, tenant):
        from apps.alerts.models import AlertRule, Alert
        from apps.cameras.models import Camera
        rules = list(AlertRule.objects.filter(tenant=tenant))
        cams = list(Camera.objects.filter(tenant=tenant))
        if not rules or not cams:
            return

        descs = {
            "restricted_zone": ["Pessoa em area restrita","Acesso nao autorizado","Funcionario em area proibida"],
            "crowding":        ["6 pessoas detectadas","Aglomeracao: 8 pessoas","Limite de lotacao atingido"],
            "loitering":       ["Pessoa parada 5min","Individuo suspeito 8min","Permanencia prolongada"],
            "night_movement":  ["Movimento as 02:34","Pessoa fora do horario","Atividade noturna suspeita"],
            "motion":          ["Movimento detectado","Objeto em movimento","Sensor ativado"],
            "fall_detection":  ["Possivel queda","Pessoa no chao","Queda detectada"],
            "missing_ppe":     ["Sem capacete","Sem colete","EPI incompleto"],
            "ai_vision":       ["IA: comportamento suspeito","IA: possivel conflito","IA: situacao de risco"],
        }
        weights = ["open"]*3 + ["acknowledged"]*2 + ["resolved"]*10
        now = timezone.now()
        to_create = []
        for _ in range(random.randint(40, 80)):
            rule = random.choice(rules)
            cam = random.choice(cams)
            status = random.choice(weights)
            triggered = now - timedelta(days=random.randint(0,30), hours=random.randint(0,23), minutes=random.randint(0,59))
            a = Alert(rule=rule, camera=cam, status=status,
                      description=random.choice(descs.get(rule.behavior, ["Alerta detectado"])),
                      detection_data={"count": random.randint(1,8), "confidence": round(random.uniform(0.7,0.99),2)},
                      notified=True)
            a._triggered = triggered
            a._resolved  = triggered + timedelta(minutes=random.randint(5,120)) if status == "resolved" else None
            to_create.append(a)

        created = Alert.objects.bulk_create(to_create)
        for alert, src in zip(created, to_create):
            Alert.objects.filter(pk=alert.pk).update(triggered_at=src._triggered, resolved_at=src._resolved)

    def _billing(self, tenant):
        from apps.billing.models import Subscription, Invoice
        sub, _ = Subscription.objects.get_or_create(tenant=tenant, defaults=dict(
            plan=tenant.plan, status=Subscription.ACTIVE,
            current_period_start=date.today().replace(day=1),
            asaas_subscription_id=f"sub_{tenant.id}_{random.randint(10000,99999)}"
        ))
        if Invoice.objects.filter(tenant=tenant).exists():
            return
        today = date.today()
        for i in range(6, 0, -1):
            due = today.replace(day=10) - timedelta(days=30*i)
            status = Invoice.PAID if i > 1 else (Invoice.OVERDUE if random.random() > 0.5 else Invoice.PENDING)
            Invoice.objects.create(
                tenant=tenant, subscription=sub, amount=tenant.plan.price, due_date=due,
                status=status, payment_method=random.choice(["boleto","pix","boleto"]),
                description=f"VisionAlert {tenant.plan.display_name} {due.strftime('%m/%Y')}",
                boleto_url=f"https://boleto.asaas.com/b/pdf/{''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=16))}" if status != "pix" else "",
                boleto_barcode="1234.56789 01234.567890 12345.678901 1 00000000000000" if status != "pix" else "",
                paid_at=timezone.make_aware(timezone.datetime.combine(due+timedelta(days=random.randint(0,3)), timezone.datetime.min.time())) if status == Invoice.PAID else None,
                asaas_payment_id=f"pay_{random.randint(100000,999999)}",
            )

    def _periodic_tasks(self):
        try:
            from django_celery_beat.models import PeriodicTask, IntervalSchedule, CrontabSchedule
            import json
            s30, _ = IntervalSchedule.objects.get_or_create(every=30, period=IntervalSchedule.SECONDS)
            cron6, _ = CrontabSchedule.objects.get_or_create(minute=0, hour=6, day_of_week="*", day_of_month="*", month_of_year="*")
            for name, task, sched in [
                ("check-cameras-health",    "apps.cameras.tasks.check_cameras_health",    {"interval": s30}),
                ("check-overdue-invoices",  "apps.billing.tasks.check_overdue_invoices",  {"crontab": cron6}),
                ("check-trial-expirations", "apps.billing.tasks.check_trial_expirations", {"crontab": cron6}),
            ]:
                PeriodicTask.objects.get_or_create(name=name, defaults={"task": task, "args": "[]", **sched})
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"  tasks: {e}"))

    def _print_summary(self):
        from apps.tenants.models import Tenant, Partner
        from apps.cameras.models import Camera
        from apps.alerts.models import Alert
        from apps.billing.models import Invoice
        self.stdout.write(self.style.SUCCESS(f"""
========================================
 SEED COMPLETO
========================================
 Clientes : {Tenant.objects.count()}
 Revendas : {Partner.objects.count()}
 Usuarios : {User.objects.count()}
 Cameras  : {Camera.objects.count()}
 Alertas  : {Alert.objects.count()}
 Faturas  : {Invoice.objects.count()}
========================================
 SUPERADMIN : admin@visionalert.com.br / admin123
 TENANT     : cliente@demo.com / cliente123
 OPERADOR   : operador@demo.com / operador123
 PARTNER    : contato@techseg.com.br / partner123
========================================
"""))
