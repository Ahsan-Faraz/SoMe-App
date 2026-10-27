# Scope boundaries: adult communities

Our team does not work on the adult (swingers) side of the platform, for religious reasons (Islam).
This file lists exactly what that means, so every task can be checked against it before we start.
The Word copy for sharing is `docs/Scope-Boundaries.docx`.

## The agreement with the client

The client proposed this split (October 2026):

- We run the platform on **non-adult domains only**. All domains share **one database**, and each domain has its own email logins.
- We create a **demo community** on each of our domains.
- We **document** how to add communities to a domain, how to switch a domain to a new name, and how to push updates to more domains.
- We only debug **our own domains**. All code is pushed to GitHub, so the client deploys and debugs any other domain (including adult ones) themselves.
- Database changes reach every domain because the database is shared.

**For now we deploy to one Hostinger domain.** The second non-adult domain comes later.

## What we do

- Build and fix the **generic platform**: chat, profiles, groups, admin tools, consents, privacy basics.
- Deploy, test and debug on **our non-adult domain(s)** only.
- Write additive, live-safe migrations for the generic platform.
- Write the guides: add a community, switch a domain name, deploy to another domain.
- Push all code to GitHub.

## What we do not do

### Deployment and hosting
- Deploy to, host, configure, or set DNS/SSL/env vars for any adult domain.
- Log in to an adult domain, its admin panel, or its hosting account.
- Run the "push to additional domains" steps for an adult domain. The client follows our guide.

### Communities and content
- Create, seed or set up adult communities, sub-communities or locked groups (for example the swingers club or "pamp").
- Write demo data, profile text, group names, images or any other content for adult communities.
- Write adult-facing copy: welcome texts, rules, onboarding, marketing, emails.

### Features and UI
- Build features that exist only for the adult use: sex life or sexual orientation fields, preferences, the consent screen for those fields, adult-only filters.
- Build the BankID age/identity gate **for the adult domain**, or per-domain encryption keys for adult data.
- Design or change UI, wording or layout specifically for an adult community.

### Bug fixes and debugging
- Debug, reproduce or fix a bug that only shows on an adult domain.
- Look at screenshots, logs, recordings or user reports that contain adult content.
- If a bug also happens on our domain, we fix it there, in the generic code. The client applies the fix to their domains.

### Database and data
- Read, query, export, edit, fix or delete rows that belong to adult communities, even though they sit in the shared database.
- Write migrations or data fixes aimed at adult communities.
- Restore or repair adult-community data after an incident.

### GDPR, legal and compliance
- Write the DPIA, privacy policy, consent texts or data processing agreements for the adult domain.
- Handle data access, export or deletion requests from adult-community members.
- Handle breach reports, IMY contact or DSA notices for adult domains.

### Testing and QA
- Test, demo or screenshot the app with adult content, accounts or communities.
- Create test accounts on adult domains.

### Support and moderation
- Review verification or ID photos of adult-community members.
- Moderate, report, block or answer content or members in adult communities.
- Give support to adult-community admins or members.

## Gray areas (decided)

1. **Generic features stay.** Couple MF/MM/FF Statuses, the 18+ toggle, the identity check, consents, profiles, chat and groups are generic and stay in the platform. We maintain them in generic form. We do **not** change them to fit an adult community's needs.
2. **Shared database.** Our migrations are for the generic platform and stay additive. We never touch adult-community rows. If a migration causes a problem that only shows on an adult domain, the client debugs it. We fix it only when it reproduces on our domain.

## How to handle a request

Before starting a task, check it against this file. If it needs us to touch anything adult (domain, data, content, feature, support), we say no politely, point to this file, and the client handles it using the code on GitHub.
