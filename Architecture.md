# ProFit Architecture

The system follows a layered architecture (Presentation, Application, Data) with MVC separation (Django ORM models, Django templates / mobile app views, Django views / DRF controllers) around a central data store (Supabase PostgreSQL).

```mermaid
graph TB
    %% Styling
    classDef presentation fill:#e0f7fa,stroke:#006064,stroke-width:2px;
    classDef application fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef data fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;
    classDef external fill:#f3e5f5,stroke:#4a148c,stroke-width:2px;

    subgraph PresentationLayer["Presentation Layer / Views"]
        Web["Staff Web Portal<br>(HTML5 / CSS / JS / Django Templates)"]:::presentation
        Mobile["Member Mobile App<br>(React Native)"]:::presentation
    end

    subgraph ApplicationLayer["Application Layer / Controllers (Vercel)"]
        DjangoController["Django Views<br>(Web Request Handlers)"]:::application
        APIController["Django REST Framework<br>(Mobile API Handlers)"]:::application
        Webhook["Webhook Receiver<br>(PayMongo Listener)"]:::application
        Auth["Authentication & RBAC Logic"]:::application
    end

    subgraph ExternalServices["External Payment Gateway"]
        PayMongo["PayMongo API<br>(GCash, Maya, Cards)"]:::external
    end

    subgraph DataLayer["Data Layer / Models (Supabase)"]
        DB["PostgreSQL Database<br>(Central Repository)"]:::data
        ORM["Django ORM<br>(Model Definitions)"]:::data
        Cron["pg_cron<br>(Automated Tasks)"]:::data
    end

    %% Connections
    Web -->|User Request / Checkout| DjangoController
    DjangoController -->|HTML Response| Web
    Mobile -->|API Request / Checkout| APIController
    APIController -->|JSON Response| Mobile

    DjangoController -->|Business Logic| Auth
    APIController -->|Business Logic| Auth

    DjangoController -->|Create Payment Intent| PayMongo
    APIController -->|Create Payment Intent| PayMongo
    PayMongo -->|Async Payment Success/Failed| Webhook

    Webhook -->|Validates & Updates Status| ORM
    Auth -->|Validates| ORM
    DjangoController <-->|Reads/Updates| ORM
    APIController <-->|Reads/Updates| ORM

    ORM <-->|SQL Queries| DB
    Cron -->|Direct DB Updates| DB
```