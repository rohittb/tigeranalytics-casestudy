import sys
import os
from decimal import Decimal

# Ensure app package is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.session import SessionLocal, engine
from app.db.base import Base
import app.models
from app.models.store import Store
from app.models.product import Product
from app.models.pricing import StorePricing
from app.models.audit import AuditEvent, AuditAction, AuditSource
from app.core.logging import logger

SAMPLE_STORES = [
    # US
    {"store_code": "STR-US-001", "name": "Downtown Manhattan Flagship", "country_code": "US"},
    {"store_code": "STR-US-002", "name": "Chicago Michigan Ave", "country_code": "US"},
    {"store_code": "STR-US-003", "name": "San Francisco Union Square", "country_code": "US"},
    {"store_code": "STR-US-004", "name": "Austin Domain Center", "country_code": "US"},
    # UK
    {"store_code": "STR-GB-001", "name": "London Oxford Street", "country_code": "GB"},
    {"store_code": "STR-GB-002", "name": "Manchester Arndale", "country_code": "GB"},
    {"store_code": "STR-GB-003", "name": "Edinburgh Princes St", "country_code": "GB"},
    # Canada
    {"store_code": "STR-CA-001", "name": "Toronto Eaton Centre", "country_code": "CA"},
    {"store_code": "STR-CA-002", "name": "Vancouver Robson Street", "country_code": "CA"},
    # Germany
    {"store_code": "STR-DE-001", "name": "Berlin Alexanderplatz", "country_code": "DE"},
    {"store_code": "STR-DE-002", "name": "Munich Marienplatz", "country_code": "DE"},
]

SAMPLE_PRODUCTS = [
    # Electronics
    {"sku": "SKU-ELEC-1001", "name": "Pro Wireless Noise-Cancelling Headphones", "category": "Electronics"},
    {"sku": "SKU-ELEC-1002", "name": "Ultra HD 4K Smart Monitor 27-inch", "category": "Electronics"},
    {"sku": "SKU-ELEC-1003", "name": "Ergonomic Mechanical Keyboard RGB", "category": "Electronics"},
    {"sku": "SKU-ELEC-1004", "name": "Precision USB-C Gaming Mouse", "category": "Electronics"},
    {"sku": "SKU-ELEC-1005", "name": "Compact Fast Charger 65W GaN", "category": "Electronics"},
    # Home & Kitchen
    {"sku": "SKU-HOME-2001", "name": "Stainless Steel Espresso Machine", "category": "Home & Kitchen"},
    {"sku": "SKU-HOME-2002", "name": "Smart Air Purifier with HEPA Filter", "category": "Home & Kitchen"},
    {"sku": "SKU-HOME-2003", "name": "Cast Iron Dutch Oven 5.5 Qt", "category": "Home & Kitchen"},
    {"sku": "SKU-HOME-2004", "name": "Double-Wall Insulated Travel Tumbler", "category": "Home & Kitchen"},
    # Apparel
    {"sku": "SKU-APPR-3001", "name": "All-Weather Technical Parka", "category": "Apparel"},
    {"sku": "SKU-APPR-3002", "name": "Merino Wool Breathable Crewneck", "category": "Apparel"},
    {"sku": "SKU-APPR-3003", "name": "Performance Stretch Chino Pant", "category": "Apparel"},
    {"sku": "SKU-APPR-3004", "name": "Waterproof Trail Running Shoes", "category": "Apparel"},
    # Grocery
    {"sku": "SKU-GROC-4001", "name": "Artisanal Single-Origin Coffee Beans 1kg", "category": "Grocery"},
    {"sku": "SKU-GROC-4002", "name": "Organic Extra Virgin Olive Oil 750ml", "category": "Grocery"},
    {"sku": "SKU-GROC-4003", "name": "Cold-Pressed Raw Honey 500g", "category": "Grocery"},
]

CURRENCY_BY_COUNTRY = {
    "US": "USD",
    "GB": "GBP",
    "CA": "CAD",
    "DE": "EUR",
}

BASE_PRICES = {
    "SKU-ELEC-1001": Decimal("249.99"),
    "SKU-ELEC-1002": Decimal("399.50"),
    "SKU-ELEC-1003": Decimal("119.00"),
    "SKU-ELEC-1004": Decimal("69.95"),
    "SKU-ELEC-1005": Decimal("39.99"),
    "SKU-HOME-2001": Decimal("299.00"),
    "SKU-HOME-2002": Decimal("179.99"),
    "SKU-HOME-2003": Decimal("89.50"),
    "SKU-HOME-2004": Decimal("28.00"),
    "SKU-APPR-3001": Decimal("195.00"),
    "SKU-APPR-3002": Decimal("78.00"),
    "SKU-APPR-3003": Decimal("65.50"),
    "SKU-APPR-3004": Decimal("135.00"),
    "SKU-GROC-4001": Decimal("22.50"),
    "SKU-GROC-4002": Decimal("18.75"),
    "SKU-GROC-4003": Decimal("14.20"),
}


def seed_database():
    print("Beginning database seed...")
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # 1. Seed Stores
        stores_by_code = {}
        for s_data in SAMPLE_STORES:
            existing = db.scalar(select(Store).where(Store.store_code == s_data["store_code"]))
            if not existing:
                store = Store(
                    store_code=s_data["store_code"],
                    name=s_data["name"],
                    country_code=s_data["country_code"],
                    active=True,
                )
                db.add(store)
                db.flush()
                stores_by_code[store.store_code] = store
                print(f"Created store: {store.store_code} - {store.name}")
            else:
                stores_by_code[existing.store_code] = existing

        # 2. Seed Products
        products_by_sku = {}
        for p_data in SAMPLE_PRODUCTS:
            existing = db.scalar(select(Product).where(Product.sku == p_data["sku"]))
            if not existing:
                product = Product(
                    sku=p_data["sku"],
                    name=p_data["name"],
                    category=p_data["category"],
                    active=True,
                )
                db.add(product)
                db.flush()
                products_by_sku[product.sku] = product
                print(f"Created product: {product.sku} - {product.name}")
            else:
                products_by_sku[existing.sku] = existing

        # 3. Seed Initial Pricing Records
        pricing_count = 0
        for store in stores_by_code.values():
            country = store.country_code
            currency = CURRENCY_BY_COUNTRY.get(country, "USD")

            for product in products_by_sku.values():
                base_price = BASE_PRICES.get(product.sku, Decimal("49.99"))
                
                # Check if pricing exists
                existing_pricing = db.scalar(
                    select(StorePricing).where(
                        StorePricing.store_id == store.id,
                        StorePricing.product_id == product.id,
                        StorePricing.country_code == country,
                        StorePricing.currency_code == currency,
                    )
                )

                if not existing_pricing:
                    pricing = StorePricing(
                        store_id=store.id,
                        product_id=product.id,
                        country_code=country,
                        currency_code=currency,
                        price=base_price,
                        version=1,
                        updated_by="system-seed",
                    )
                    db.add(pricing)
                    db.flush()

                    # Audit record
                    audit = AuditEvent(
                        actor_id="system-seed",
                        action=AuditAction.CREATE,
                        entity_key=f"store:{store.store_code}|sku:{product.sku}|{country}|{currency}",
                        before_value=None,
                        after_value={"price": str(base_price), "version": 1},
                        source=AuditSource.MANUAL,
                        correlation_id="initial-seed",
                    )
                    db.add(audit)
                    pricing_count += 1

        db.commit()
        print(f"Database seed completed successfully! Seeded {pricing_count} pricing records.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
