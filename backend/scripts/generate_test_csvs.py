import os
import csv

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))
os.makedirs(SAMPLES_DIR, exist_ok=True)

HEADERS = ["store_code", "product_sku", "country_code", "currency_code", "price"]


def generate_valid_pricing_csv():
    path = os.path.join(SAMPLES_DIR, "valid_pricing.csv")
    rows = [
        # Manhattan store updates
        ["STR-US-001", "SKU-ELEC-1001", "US", "USD", "229.99"],
        ["STR-US-001", "SKU-ELEC-1002", "US", "USD", "379.00"],
        ["STR-US-001", "SKU-HOME-2001", "US", "USD", "285.50"],
        ["STR-US-001", "SKU-APPR-3001", "US", "USD", "175.00"],
        ["STR-US-001", "SKU-GROC-4001", "US", "USD", "21.00"],
        # London Oxford St updates
        ["STR-GB-001", "SKU-ELEC-1001", "GB", "GBP", "199.99"],
        ["STR-GB-001", "SKU-ELEC-1003", "GB", "GBP", "99.00"],
        ["STR-GB-001", "SKU-HOME-2002", "GB", "GBP", "149.95"],
        ["STR-GB-001", "SKU-GROC-4002", "GB", "GBP", "16.50"],
        # Toronto updates
        ["STR-CA-001", "SKU-ELEC-1004", "CA", "CAD", "89.99"],
        ["STR-CA-001", "SKU-APPR-3002", "CA", "CAD", "95.00"],
        # Berlin updates
        ["STR-DE-001", "SKU-ELEC-1005", "DE", "EUR", "34.90"],
        ["STR-DE-001", "SKU-HOME-2003", "DE", "EUR", "79.99"],
    ]

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADERS)
        writer.writerows(rows)
    print(f"Generated {path} with {len(rows)} valid records.")


def generate_mixed_valid_invalid_csv():
    path = os.path.join(SAMPLES_DIR, "mixed_valid_invalid.csv")
    rows = [
        # Valid row 1
        ["STR-US-002", "SKU-ELEC-1001", "US", "USD", "239.99"],
        # Error 1: Unknown store code
        ["UNKNOWN-STORE-999", "SKU-ELEC-1002", "US", "USD", "350.00"],
        # Error 2: Unknown product SKU
        ["STR-US-002", "UNKNOWN-SKU-999", "US", "USD", "45.00"],
        # Error 3: Excess precision (3 decimal places, reject without silent rounding)
        ["STR-US-002", "SKU-HOME-2001", "US", "USD", "299.999"],
        # Error 4: Negative price
        ["STR-US-002", "SKU-APPR-3001", "US", "USD", "-15.50"],
        # Error 5: Missing required store_code
        ["", "SKU-GROC-4001", "US", "USD", "20.00"],
        # Error 6: Missing price
        ["STR-US-002", "SKU-GROC-4002", "US", "USD", ""],
        # Error 7: Invalid non-numeric price string
        ["STR-US-002", "SKU-GROC-4003", "US", "USD", "FREE_PROMO"],
        # Error 8 & 9: In-file duplicate keys (both rows flagged)
        ["STR-GB-002", "SKU-ELEC-1003", "GB", "GBP", "105.00"],
        ["STR-GB-002", "SKU-ELEC-1003", "GB", "GBP", "110.00"],
        # Valid row 2
        ["STR-CA-002", "SKU-APPR-3003", "CA", "CAD", "72.00"],
    ]

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADERS)
        writer.writerows(rows)
    print(f"Generated {path} with mixed valid/invalid rows.")


def generate_stale_version_conflict_csv():
    path = os.path.join(SAMPLES_DIR, "stale_version_conflict.csv")
    rows = [
        # This row targets STR-US-001 / SKU-ELEC-1001. If modified during preview, apply will detect conflict!
        ["STR-US-001", "SKU-ELEC-1001", "US", "USD", "210.00"],
        ["STR-US-001", "SKU-ELEC-1003", "US", "USD", "109.95"],
    ]

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADERS)
        writer.writerows(rows)
    print(f"Generated {path} for testing stale version conflicts.")


if __name__ == "__main__":
    generate_valid_pricing_csv()
    generate_mixed_valid_invalid_csv()
    generate_stale_version_conflict_csv()
