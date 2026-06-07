"""Event notifications (F-021/F-022/§5.3/§5.4). Email always; SMS only with
transactional consent. Each send is idempotent via the message_log guard."""

import logging

from app.config import get_settings
from app.email import send_email
from app.sms import send_sms

logger = logging.getLogger("eastern-rentals-api")
settings = get_settings()


def notify_reservation_confirmed(svc, rental_id: str) -> None:
    r = (
        svc.table("rentals")
        .select("id,customer_id,product_id,start_date,end_date,balance_amount")
        .eq("id", rental_id)
        .execute()
        .data
    )
    if not r:
        return
    rental = r[0]
    cust = (
        svc.table("customers")
        .select("full_name,email,phone,transactional_sms")
        .eq("id", rental["customer_id"])
        .execute()
        .data[0]
    )
    prod = svc.table("products").select("name").eq("id", rental["product_id"]).execute().data
    product_name = prod[0]["name"] if prod else "your equipment"
    link = f"{settings.app_base_url}/reserve/confirmation/{rental_id}"

    send_email(
        to=cust["email"],
        subject=f"Reservation confirmed — {product_name}",
        html=(
            f"<p>Your reservation for <strong>{product_name}</strong> "
            f"({rental['start_date']} → {rental['end_date']}) is confirmed.</p>"
            f"<p><strong>What's next:</strong> upload your driver's license and sign your contract "
            f"&amp; waiver. Balance due at pickup: ${float(rental['balance_amount']):.2f}.</p>"
            f"<p><a href='{link}'>Open your work order</a></p>"
        ),
        template="reservation_confirmed",
        customer_id=rental["customer_id"],
        rental_id=rental_id,
    )
    send_sms(
        to=cust.get("phone"),
        body=(
            f"Eastern Rentals: reservation confirmed for {product_name} {rental['start_date']}. "
            f"Next: upload license & sign docs — {link}"
        ),
        template="reservation_confirmed",
        consent=bool(cust.get("transactional_sms")),
        customer_id=rental["customer_id"],
        rental_id=rental_id,
    )
