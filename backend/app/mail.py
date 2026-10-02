import smtplib
import ssl
from email.message import EmailMessage
from app.config import settings


def send_invitation(email: str, token: str):
    if not settings.smtp_host or not settings.smtp_from or not settings.public_app_url:
        return False
    message = EmailMessage()
    message["From"], message["To"] = settings.smtp_from, email
    message["Subject"] = "Your BookLender Studio invitation"
    link = f"{settings.public_app_url.rstrip('/')}/activate#token={token}"
    message.set_content(f"You have been invited to BookLender Studio.\n\nSet up your account: {link}\n\nThis one-time invitation expires in 48 hours.")
    context = ssl.create_default_context()
    if settings.smtp_security == "ssl":
        connection = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=context)
    else:
        connection = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    with connection as smtp:
        if settings.smtp_security == "starttls":
            smtp.starttls(context=context)
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
    return True
