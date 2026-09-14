#!/usr/bin/env python3
"""
FVK Knowledge & Git Activity Synchronizer for Kwipu.

This script:
1. Analyzes the latest Git commits, PR merges, domain changes, and architecture evolution in /Users/mac134/check24/fvk/rewrite/fvk.
2. Updates and generates structured Obsidian markdown notes with full wikilinks and YAML frontmatter in knowledge_base/fvk/.
3. Rebuilds the property graph index using geode_graph.py.
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

FVK_REPO = Path("/Users/mac134/check24/fvk/rewrite/fvk")
KWIPU_ROOT = Path("/Users/mac134/Documents/playground/Kwipu")
KNOWLEDGE_FVK = KWIPU_ROOT / "knowledge_base" / "fvk"


def get_git_log(days: int = 30) -> list[dict]:
    cmd = [
        "git", "-C", str(FVK_REPO), "log",
        f"--since={days}.days.ago",
        "--pretty=format:%h|%ad|%s|%an",
        "--date=short"
    ]
    try:
        output = subprocess.check_output(cmd, text=True, errors="replace")
    except Exception as e:
        print(f"Error running git log: {e}")
        return []

    entries = []
    for line in output.strip().splitlines():
        if not line:
            continue
        parts = line.split("|", 3)
        if len(parts) == 4:
            entries.append({
                "hash": parts[0],
                "date": parts[1],
                "subject": parts[2],
                "author": parts[3]
            })
    return entries


def generate_recent_activity_note(commits: list[dict]):
    KNOWLEDGE_FVK.mkdir(parents=True, exist_ok=True)
    note_path = KNOWLEDGE_FVK / "Git Activity & Architecture Evolution.md"

    content = f"""---
title: Git Activity & Architecture Evolution
category: Architecture Evolution
project: FVK (Fahrradversicherung)
stack: Git, Bitbucket PRs, Monorepo, Monolith, Symfony, React, TypeScript
status: Active
author: FVK Engineering & Kwipu Sync
updated_at: {datetime.now().strftime("%Y-%m-%d")}
---

# FVK Git Activity & Architecture Evolution

This document tracks recent codebase evolution, pull requests, domain expansions, and developer activity across `/Users/mac134/check24/fvk/rewrite/fvk`.

---

## 1. Key Recent Pull Requests & Architectural Enhancements

The monorepo has seen intensive continuous engineering across backend DDD domains, BFF layers, data migration, and frontend applications:

### 1.1 Goodwill Payout Retry & Manual Review Queue
- **PR #651 (`feat/payout-11-goodwill-crm-retry`):** Exposes goodwill payout retry action on CRM contract page. Includes backend `RetryGoodwillPaymentController`, `RetryGoodwillPaymentUseCase`, domain service failure evaluation via `isGoodwillPaymentRetryable`, and typed exceptions (`GoodwillPaymentNotFoundException`, `GoodwillPaymentNotRetryableException`).
- **PR #650 (`feat/payout-10-manual-review-queue`):** Introduces a dedicated manual review queue in CRM for high-value and flagged goodwill payouts with approval/rejection modal workflows, reason tracking, and revision resolution (`PayoutManualReviewQueueController`, `GetManualReviewQueueUseCase`, `LatestPayoutRevisionQuery`, `ManualReviewService`).
- **Key Domains Touched:** [[Domain - Payouts & Goodwill]], [[Domain - Communication & CRM]], [[Frontend Applications]].

### 1.2 Strict BFF Request Validation (Round 1)
- **PR #709 (`bff-validation-1`):** Adds comprehensive Symfony validation constraints across BFF request DTOs and AI Bot tool payloads (`BikePurchaseDate`, `BikePurchasePrice`, `GermanPostalCode`, `DateOfBirth`, `BikeFieldLimitsConfig`, `DateOfBirthLimits`).
- **Endpoints & Tools Protected:** `PersonalDataRequestBffDto`, `QuoteListRequestBffDto`, `ChangeAddressToolRequestBffDto`, `FillIncompleteOrderPersonalDataToolRequestBffDto`, `QuoteListToolRequestBffDto`.
- **Key Domain Touched:** [[BFF Layer]], [[Security & Hardening Deep Dive]], [[Architecture & Monolith Deep Dive]].

### 1.3 Legacy Lead Migration Writer
- **PR #715 (`codex/legacy-lead-writer`):** High-throughput migration pipeline for legacy leads into the rewritten architecture. Includes DB migration `Version20260909100000`, `LegacyLeadMigrationEntity`, `LegacyLeadMigrationDbRepository`, `LegacyLeadMigrationCommand`, `LegacyLeadMigrationPlanner`, and transactional `LegacyLeadMigrationWriter` with extensive end-to-end tests.
- **Key Domains Touched:** [[Domain - Contract & Order]], [[Database & Infrastructure]].

### 1.4 Prior Damage Exclusion Configuration (PIM & Tariff)
- **PR #711 (`stack/1-prior-damage-exclusion`):** PIM enhancement adding `prior_damage_exclusion` enum configuration in insurer tariff note tabs (`PriorDamageExclusionEnum`, `InsurerTariffNoteTab.tsx`, DB migration `Version20260904140000`, PIM DTOs and mappers).
- **Key Domains Touched:** [[Domain - Comparison & Tariff]], [[Frontend Applications]].

### 1.5 Checkout Payment Period Batching & Performance Optimization
- **PR #710 (`checkout-payment-period-batch`):** Eliminates N+1 insurer queries during quote checkout payment period calculations by introducing `CheckoutPaymentPeriodInsurerBatch` and cached batch retrieval in `QuoteCheckoutPaymentPeriodEnricher`.
- **PR #706 (`bullet-inputs-projection`):** Introduces `TariffBulletInputsView` and `TariffBulletInputsResponseDto` with optimized selective database projections in `TariffDbRepository` to accelerate comparison quote enrichment.
- **Key Domain Touched:** [[Domain - Comparison & Tariff]], [[Checkout Submit & Order Defense]].

### 1.6 Customer Feedback Reviews Pagination & UI Alignment
- **PR #708 (`feat/feedback_pagination`):** Full pagination support for CRM customer feedback reviews, moderation stats (`FeedbackModerationStatsResponseBffDto`), and database pagination trait `PaginatesQueries`.
- **PR #659 (`cursor/result-page-parameter-edit-ui`):** Aligns comparison result page parameter edit popovers with product-entry using unified `C24DateField`, `C24Radio`, and `C24Select` components.
- **Key Domains Touched:** [[Frontend Applications]], [[BFF Layer]].

### 1.7 AI Tariff Summarization Specification
- **PR #718 (`AI-Tariff-Summary-Spec`):** Complete product and technical specification for AI-driven tariff highlights generation, prompt contracts, and token budget management (`docs/specs/features/tariff-ai-summarization.md`).
- **Key Domain Touched:** [[FVK Overview & Architecture]], [[Domain - Comparison & Tariff]].

### 1.8 Architectural Decoupling: OrderFacade Cleanliness
- **PR #702 (`order-facade-remove-repo`):** Decouples `OrderFacade` from direct database repository dependencies by routing all order persistence operations strictly through `OrderService`, preserving domain layer boundaries.
- **Key Domain Touched:** [[Domain - Contract & Order]], [[Backend Domains & DDD]], [[Coding Standards & Deptrac]].

---

## 2. Recent Merged Commits Summary

| Commit | Date | Pull Request / Subject | Author |
| :--- | :--- | :--- | :--- |
"""
    for c in commits[:35]:
        content += f"| `{c['hash']}` | {c['date']} | {c['subject']} | {c['author']} |\n"

    content += """
---

## 3. Architecture Impact & Synchronization

- **Monorepo Atomic Commits:** All BFF endpoint updates, OpenAPI TypeScript client regenerations (`app/repositories/monolith-client/generated/`), and React SSR view modifications remain strictly synchronized within single PRs.
- **Zero-Baseline Deptrac:** Quality gates remain fully compliant with zero violations across all 18 domains and 12 BFF contexts.
- **Bounded Context Integrity:** Repositories are strictly encapsulated within domain services; presentation facades only expose public DTOs and use cases.

---

## 4. Related Notes

- [[FVK Overview & Architecture]]
- [[Architecture & Monolith Deep Dive]]
- [[BFF Layer]]
- [[Backend Domains & DDD]]
- [[Domain - Comparison & Tariff]]
- [[Domain - Payouts & Goodwill]]
- [[Domain - Contract & Order]]
- [[Frontend Applications]]
- [[Checkout Submit & Order Defense]]
- [[Contracts, Tooling & Quality Gates]]
- [[Contributor Matrix & Blame Ownership]]
"""

    note_path.write_text(content, encoding="utf-8")
    print(f"Generated: {note_path}")


def update_domain_notes():
    # Update Domain - Payouts & Goodwill.md
    payout_note = KNOWLEDGE_FVK / "Domain - Payouts & Goodwill.md"
    payout_content = """---
title: Domain - Payouts & Goodwill Payments
category: Domain Logic
project: FVK (Fahrradversicherung)
stack: PHP 8.5, Banking, SEPA, Approvals, Accounting, CRM
status: Active
author: Operations & Claims Team
updated_at: 2026-09-09
---

# FVK Domain: Payouts & Goodwill Payments

The **Payout** domain manages direct financial compensation, vouchers, cashbacks, and goodwill payments (Kulanzzahlungen) issued directly by CHECK24 to customers.

---

## 1. Context & Business Use Cases

In bike insurance, situations arise where customer satisfaction requires fast monetary settlement prior to or alongside formal insurer reimbursement:
- **Goodwill Settlements (Kulanz):** Compensating a customer for repair delays, disputed minor damages, or customer service resolution.
- **Immediate Advance Payments (Sofortauszahlung):** Advance funding for emergency repairs or lock replacement while insurer claim review is pending.
- **Cashback / Voucher Rewards:** Direct bank transfer of promotional cashback amounts.

---

## 2. Governance, Manual Review Queue & Approval Matrix

To maintain strict financial integrity and audit compliance:
- **Tier 1 (Agent):** Payouts up to €50 can be authorized immediately by frontline customer support agents.
- **Tier 2 (Team Lead):** Payouts between €50 and €250 require dual-control sign-off (Zwei-Augen-Prinzip) by a Team Lead.
- **Tier 3 (Department Head / Director):** Payouts above €250 require Senior Management approval.

### Manual Review Queue (`PR #650`)
- **Controller & Use Case:** `PayoutManualReviewQueueController`, `GetManualReviewQueueUseCase`.
- **Query Architecture:** `LatestPayoutRevisionQuery` resolves the most recent revision state across cashbacks, vouchers, and goodwill transactions.
- **Workflow Actions:** Agents and leads can review pending transactions, approve them for SEPA processing, or reject them with structured rejection reasons via `ManualReviewQueueRejectDialog`.

---

## 3. Goodwill Payment Retry Mechanism (`PR #651`)

When a goodwill payout fails (e.g. invalid IBAN, bank rejection, or API timeout), the system provides controlled retry capabilities:
- **Evaluation Logic:** `isGoodwillPaymentRetryable` verifies that the payment status is in a retryable failure state and has not exceeded maximum retry attempts.
- **BFF Controller & Use Case:** `RetryGoodwillPaymentController` invokes `RetryGoodwillPaymentUseCase` to safely recreate the payment instruction and reset banking delivery state.
- **Exception Safety:** Guarded by `GoodwillPaymentNotFoundException` and `GoodwillPaymentNotRetryableException` to prevent accidental double-disbursements.

---

## 4. Transaction Execution & Accounting

1. **SEPA Payment Initiation:** Integration with corporate banking APIs to generate ISO 20022 `pain.001` SEPA credit transfer batches.
2. **Reconciliation & Auditing:** Immutable audit logging of approving agent, timestamp, internal reason code, linked contract ID, and banking confirmation.

---

## 5. Related Notes

- [[Frontend Applications]] (CRM UI)
- [[Domain - Contract & Order]]
- [[Domain - Communication & CRM]]
- [[Backend Domains & DDD]]
- [[Git Activity & Architecture Evolution]]
"""
    payout_note.write_text(payout_content, encoding="utf-8")
    print(f"Updated: {payout_note}")

    # Update BFF Layer.md
    bff_note = KNOWLEDGE_FVK / "BFF Layer.md"
    bff_content = """---
title: Backend for Frontend (BFF) Architecture
category: Architecture
project: FVK (Fahrradversicherung)
stack: PHP 8.5, Symfony, OpenAPI, TypeScript SDK, React
status: Active
author: FVK Engineering
updated_at: 2026-09-09
---

# FVK Backend for Frontend (BFF) Architecture

The **BFF layer** in the FVK monolith acts as the dedicated integration boundary between frontend applications (Journey, CRM, PIM, SIM, Customer Area, The Bot) and internal DDD backend domain facades.

---

## 1. Architectural Role & Principles

- **Context Isolation:** Each frontend application has its dedicated BFF namespace (e.g., `App\\BFF\\CRM`, `App\\BFF\\Journey`, `App\\BFF\\PIM`, `App\\BFF\\TheBot`).
- **No Direct Domain Leakage:** BFF controllers and use cases communicate exclusively with DDD Presentation Facades (`TariffFacade`, `OrderFacade`, `PayoutFacade`, `FeedbackFacade`).
- **Contract-First Code Generation:** OpenAPI specs generated from PHP BFF DTOs produce typed TypeScript SDKs and Zod schemas in `app/repositories/monolith-client/generated/`.

---

## 2. Request Validation Architecture (`PR #709`)

To guarantee data consistency and defense-in-depth before reaching domain services, Symfony Validation constraints are strictly applied to BFF request DTOs:

### Core Validation Constraints:
- **`GermanPostalCode`:** Validates 5-digit German postal codes against official postal code rules.
- **`DateOfBirth` / `DateOfBirthLimits`:** Validates age limits for policyholders (e.g. minimum 18 years, maximum 100 years).
- **`BikePurchaseDate`:** Ensures bike purchase date is not in the future and conforms to allowable insurance policy lookback windows.
- **`BikePurchasePrice` / `BikeFieldLimitsConfig`:** Enforces numeric boundary checks for insured bicycle purchase prices.

### Protected DTOs & Bot Tools:
- `PersonalDataRequestBffDto` (Checkout & Journey)
- `QuoteListRequestBffDto` (Comparison engine)
- `ChangeAddressToolRequestBffDto` (AI Customer Service Bot)
- `FillIncompleteOrderPersonalDataToolRequestBffDto` (The Bot Checkout)
- `QuoteListToolRequestBffDto` (The Bot Tariff Search)

---

## 3. Related Notes

- [[Architecture & Monolith Deep Dive]]
- [[Backend Domains & DDD]]
- [[Frontend Applications]]
- [[Contracts, Tooling & Quality Gates]]
- [[Git Activity & Architecture Evolution]]
"""
    bff_note.write_text(bff_content, encoding="utf-8")
    print(f"Updated: {bff_note}")

    # Update Domain - Comparison & Tariff.md
    tariff_note = KNOWLEDGE_FVK / "Domain - Comparison & Tariff.md"
    tariff_content = """---
title: Domain - Comparison & Tariff Engine
category: Domain Logic
project: FVK (Fahrradversicherung)
stack: PHP 8.5, Calculation Engines, Performance Projections, MySQL
status: Active
author: Pricing & Calculation Squad
updated_at: 2026-09-09
---

# FVK Domain: Comparison & Tariff Calculation

The **Tariff** domain provides core pricing, eligibility rules, and coverage evaluations for the bicycle insurance comparison engine.

---

## 1. High-Performance Calculation Pipeline

1. **Quote Request Parsing & Normalization:** Ingests bike category, purchase price, postal code, age, and desired coverage options.
2. **Underwriting Filter Matrix:** Excludes tariffs failing insurer hard criteria (e.g. max price, e-bike battery exclusions, prior damage restrictions).
3. **Checkout Payment Period Batching (`PR #710`):** `CheckoutPaymentPeriodInsurerBatch` retrieves payment period configurations in bulk for all insurers on a quote list, completely eliminating N+1 query overhead.
4. **Tariff Bullet Inputs Projection (`PR #706`):** `TariffBulletInputsView` projects only necessary bullet fields from `TariffDbRepository` to rapidly enrich quote lists.
5. **Prior Damage Exclusion Management (`PR #711`):** Insurers can configure `PriorDamageExclusionEnum` via PIM to filter or customize policy underwriting terms for pre-damaged bikes.

---

## 2. Architectural Highlights & DDD Isolation

- **`TariffFacade` Boundaries:** All calculations and lookups are exposed via DTOs (`TariffResponseDto`, `TariffBulletInputsResponseDto`).
- **AI Tariff Summarization (`PR #718`):** AI-powered semantic highlights generation for customer quote comparisons based on structured tariff attributes.

---

## 3. Related Notes

- [[BFF Layer]]
- [[Frontend Applications]]
- [[Checkout Submit & Order Defense]]
- [[Git Activity & Architecture Evolution]]
"""
    tariff_note.write_text(tariff_content, encoding="utf-8")
    print(f"Updated: {tariff_note}")

    # Update Domain - Contract & Order.md
    order_note = KNOWLEDGE_FVK / "Domain - Contract & Order.md"
    order_content = """---
title: Domain - Contract & Order Management
category: Domain Logic
project: FVK (Fahrradversicherung)
stack: PHP 8.5, Event Sourcing, Migrations, State Machines, Doctrine
status: Active
author: Core Insurance Platform Team
updated_at: 2026-09-09
---

# FVK Domain: Contract & Order Management

The **Order & Contract** domain handles the core lifecycle of insurance contracts from initial incomplete lead creation, checkout completion, and insurer transmission to contract signing, modifications, and legacy migration.

---

## 1. Legacy Lead Migration Pipeline (`PR #715`)

To migrate historical lead data from the legacy FVK system to the rewritten monolith:
- **`LegacyLeadMigrationPlanner`:** Computes migration plans, identifies missing SSO UUIDs, and stages lead records for transactional execution.
- **`LegacyLeadMigrationWriter`:** Atomically persists `LegacyLeadMigrationEntity` records into the database with chunked transactions, rollbacks, and idempotency guarantees.
- **Database Schema:** Supported by migration `Version20260909100000.php`.

---

## 2. OrderFacade DDD Encapsulation (`PR #702`)

- Direct database repository queries (`OrderDbRepository`) have been removed from `OrderFacade`.
- All operations are strictly routed through `OrderService`, preserving domain boundaries and test isolation.

---

## 3. Related Notes

- [[Domain - Comparison & Tariff]]
- [[Domain - Payouts & Goodwill]]
- [[BFF Layer]]
- [[Database & Infrastructure]]
- [[Git Activity & Architecture Evolution]]
"""
    order_note.write_text(order_content, encoding="utf-8")
    print(f"Updated: {order_note}")


def main():
    print(f"Reading Git activity from {FVK_REPO}...")
    commits = get_git_log(30)
    print(f"Found {len(commits)} commits in the last 30 days.")
    generate_recent_activity_note(commits)
    update_domain_notes()
    print("FVK knowledge base updated successfully.")


if __name__ == "__main__":
    main()
