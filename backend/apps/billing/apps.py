from django.apps import AppConfig
class BillingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.billing"
    verbose_name = "Financeiro"
    def ready(self):
        try:
            from django_celery_beat.models import PeriodicTask, CrontabSchedule
            import json
            cron_daily, _ = CrontabSchedule.objects.get_or_create(
                minute=0, hour=6, day_of_week="*", day_of_month="*", month_of_year="*"
            )
            for name, task in [
                ("check-overdue-invoices", "apps.billing.tasks.check_overdue_invoices"),
                ("check-trial-expirations","apps.billing.tasks.check_trial_expirations"),
            ]:
                PeriodicTask.objects.get_or_create(
                    name=name, defaults={"task": task, "crontab": cron_daily, "args": json.dumps([])}
                )
        except Exception:
            pass
