/* ==========================================================================
   WESLEY_SKAP PORTFOLIO - CORE ENGINE & LOCALIZATION
   ========================================================================== */

const PORTFOLIO_CONTENT = {
    "pt-BR": {
        nav: {
            about: "Sobre",
            repositories: "Repositórios",
            articles: "Artigos",
            contact: "Contato"
        },
        about: {
            title: "Wesley Lima",
            subtitle: "Engenheiro de Software",
            desc: "Engenheiro de Software com 20 anos de experiência no desenvolvimento de aplicações backend, frontend, mobile e arquitetura de sistemas distribuídos de alta escala e complexidade. Especialista em construir soluções de alta disponibilidade, telemetria avançada, resiliência sistêmica, TDD e integrações práticas de IA Generativa.",
            capabilitiesTitle: "Sumário de Capacidades",
            capabilities: [
                {
                    title: "Arquitetura de Sistemas",
                    desc: "Desenho e evolução de sistemas distribuídos de larga escala, microsserviços, arquitetura orientada a eventos (Event-driven), DDD (Domain-Driven Design), alta disponibilidade, resiliência e plataformas SaaS multi-tenant."
                },
                {
                    title: "Concepção do Desenvolvimento",
                    desc: "Ciclo de vida completo de desenvolvimento e liderança técnica de times. Sólida experiência em projetos complexos para marcas como Google, Raízen, Folha de S.Paulo, Valor Econômico e Pearson."
                },
                {
                    title: "Qualidade & Testes",
                    desc: "Adoção sistemática de TDD (Test-Driven Development) como garantia de manutenibilidade, design de código desacoplado (SOLID) e otimização contínua de performance (Performance Tuning)."
                },
                {
                    title: "Aplicações Mobile & Web",
                    desc: "Desenvolvimento de frontend e aplicações mobile cross-platform integrados de forma segura a APIs resilientes hospedadas em nuvem (Azure, AWS, GCP)."
                },
                {
                    title: "IA Generativa & Agentes",
                    desc: "Atuação nos últimos 4 anos no desenvolvimento de soluções práticas com LLMs, arquiteturas de RAG (Retrieval-Augmented Generation), automações baseadas em IA e agentes autônomos."
                }
            ],
            timelineTitle: "Trajetória Profissional",
            timeline: [
                {
                    role: "Líder Técnico & Desenvolvedor Full Stack Ruby Sênior",
                    company: "Orangebox Technology / Oramont Businesstech",
                    period: "Mai 2025 - ",
                    desc: "Condução de decisões de arquitetura, estruturação técnica e implementação de estratégias de observabilidade (telemetria e rastreabilidade distribuída) para garantir a resiliência dos projetos. Reorganização estrutural de times de engenharia e otimização do fluxo de trabalho, controlando métricas de Lead Time e Cycle Time com uso de Throughput histórico para previsibilidade. Desenvolvimento de soluções de IA Generativa e agentes inteligentes com Python (LangChain/FastAPI), integrando LLMs a aplicações corporativas com Node.js, Kotlin, Go e React.",
                    tech: ["Ruby on Rails", "C#", "Golang", "Kotlin (Quarkus)", "PHP", "Python", "Node.js", "Next.js", "React", "Angular"],
                    refName: "Diego Mondego (CEO)",
                    refLink: "https://www.linkedin.com/in/diego-mondego/",
                    refSite: "https://oramont.com/",
                    refEmail: "diego@oramont.com"
                },
                {
                    role: "Líder Técnico & Desenvolvedor Full Stack Ruby Sênior",
                    company: "Digital Pages",
                    period: "Ago 2011 - Abr 2025",
                    desc: "Transição bem-sucedida de monólitos legados para microsserviços e arquitetura orientada a eventos (Event-Driven) e notificações push, utilizando brokers como Kafka, RabbitMQ, Redis e AWS SQS/SNS para suportar com estabilidade mais de 20.000 usuários simultâneos em portais de CMS e SaaS de clientes como Google, Cogna, Raízen, Folha de S.Paulo, Valor Econômico, Editora Abril e Pearson. Modernização de infraestruturas locais para cloud (AWS/Azure/GCP) usando Terraform (IaC). Liderança técnica de equipes com redução de Lead/Cycle Time em 30% usando Throughput histórico. Mentoria ativa e PDIs. Implementação de observabilidade (OpenTelemetry/Grafana) e TDD.",
                    tech: ["Ruby on Rails", "C#", "Java (Spring Boot)", "Golang", "Python", "Node.js", "PHP", "React", "Next.js", "Angular", "Vue", "Azure", "AWS", "GCP", "Terraform", "Kafka", "RabbitMQ", "Redis", "OpenTelemetry"],
                    refName: "Youssef Mourad (CEO)",
                    refLink: "https://www.linkedin.com/in/youssef-mourad-449346/",
                    refSite: "https://www.digitalpages.com.br/",
                    refEmail: "youssef.mourad@digitalpages.com.br"
                },
                {
                    role: "Desenvolvedor Ruby Pleno",
                    company: "Maya Comunicação",
                    period: "Fev 2011 - Jul 2011",
                    desc: "Desenvolvimento de aplicações web utilizando Ruby on Rails e manutenção evolutiva de sistemas corporativos.",
                    tech: ["Ruby on Rails", "MySQL", "JavaScript", "CSS", "HTML"]
                },
                {
                    role: "Desenvolvedor Ruby Pleno",
                    company: "Publi9",
                    period: "Ago 2010 - Fev 2011",
                    desc: "Desenvolvimento, criação de novas funcionalidades e manutenção de aplicações baseadas em Ruby on Rails.",
                    tech: ["Ruby on Rails", "MySQL", "JavaScript", "CSS", "HTML"]
                },
                {
                    role: "Desenvolvedor ASP / .NET Júnior",
                    company: "Grupo Inova",
                    period: "Jan 2010 - Ago 2010",
                    desc: "Desenvolvimento de aplicações web utilizando ASP.NET e manutenção de integrações e sistemas internos.",
                    tech: ["ASP.NET", "C#", "SQL Server", "HTML", "CSS", "JavaScript"]
                },
                {
                    role: "Desenvolvedor PHP e Ruby Júnior",
                    company: "Temmais.com / TV Tem (Rede Globo)",
                    period: "Out 2008 - Out 2009",
                    desc: "Desenvolvimento de funcionalidades web e manutenção de portais de conteúdo de alta volumetria em PHP e Ruby.",
                    tech: ["PHP", "Ruby", "MySQL", "JavaScript", "HTML", "CSS"]
                },
                {
                    role: "Desenvolvedor",
                    company: "Excelência Global Ltda",
                    period: "Fev 2006 - Set 2008",
                    desc: "Desenvolvimento, suporte técnico e evolução de sistemas corporativos internos.",
                    tech: ["PHP", "MySQL", "JavaScript", "HTML", "CSS", "SQL Server"]
                }
            ]
        },
        repositories: {
            heading: "Projetos & Repositórios",
            items: [
                {
                    title: "orkai-observability",
                    url: "https://github.com/wesleyskap/orkai-observability",
                    description: "Biblioteca de observabilidade de ultra-performance desenvolvida em Go. Projetada para fornecer logs JSON livre de reflexão e tracing dinâmico na pilha LIFO com alocação em heap quase zero.",
                    tech: ["Go", "OpenTelemetry", "Performance Tuning"]
                },
                {
                    title: "onkai-unified-bus",
                    url: "https://github.com/wesleyskap/onkai-unified-bus",
                    description: "Barramento unificado de mensageria assíncrona concorrente em Go. Implementa pooling de goroutines (Worker Pool), controle de fluxo por Backpressure e drivers desacoplados para RabbitMQ, NATS e Kafka.",
                    tech: ["Go", "RabbitMQ", "NATS", "Kafka", "Concurrency"]
                },
                {
                    title: "abacos-ruby",
                    url: "https://github.com/wesleyskap/abacos-ruby",
                    description: "Integração oficial em Ruby para o ERP Ábacos. Facilita o mapeamento e troca de mensagens de pedidos, estoque e faturamento para ecossistemas de e-commerce complexos.",
                    tech: ["Ruby", "ERP Integration", "E-commerce"]
                },
                {
                    title: "b2w-ruby",
                    url: "https://github.com/wesleyskap/b2w-ruby",
                    description: "SDK em Ruby para sincronização de catálogo, preço e estoque com a API do marketplace B2W (Americanas, Submarino, Shoptime).",
                    tech: ["Ruby", "Marketplace API", "Integrations"]
                },
                {
                    title: "orkai-runiq",
                    url: "https://github.com/wesleyskap/orkai-runiq",
                    description: "Filtro concorrente de alta performance em Go para remoção de chaves duplicadas em streams massivos de dados.",
                    tech: ["Go", "Concurrency", "Data Pipelines"]
                },
                {
                    title: "shared_broker",
                    url: "https://github.com/wesleyskap/shared_broker",
                    description: "Gema Ruby para desacoplamento e resiliência de barramentos de mensageria. Implementa o padrão Adapter (InMemory, RabbitMQ, Kafka, Redis), retries com backoff exponencial, DLQ e Circuit Breaker thread-safe.",
                    tech: ["Ruby", "RabbitMQ", "Kafka", "Resilience"]
                },
                {
                    title: "bseller-ruby",
                    url: "https://github.com/wesleyskap/bseller_ruby",
                    description: "Integração em Ruby para o ecossistema BSeller (B2W). Permite sincronização rápida de catálogos de produtos, pedidos, estoques e faturamento para e-commerces.",
                    tech: ["Ruby", "E-commerce", "Integrations"]
                },
                {
                    title: "extra-ruby",
                    url: "https://github.com/wesleyskap/extra_ruby",
                    description: "Biblioteca Ruby para comunicação com a API do marketplace Extra (Via Varejo), automatizando gestão de fretes, precificação e tracking de entregas.",
                    tech: ["Ruby", "Marketplace API", "Integrations"]
                }
            ]
        },
        contact: {
            title: "Contato Profissional",
            desc: "Consultoria em arquitetura, microsserviços, observabilidade e telemetria. Desenvolvimento e liderança técnica... entre em contato.",
            directTitle: "Canais de Comunicação Direta"
        },
        blog: {
            heading: "Technical Ledger (Artigos Técnicos)",
            authorLabel: "Por",
            readTimeLabel: "de leitura",
            backLabel: "Voltar",
            seriesLabel: "Série",
            relatedTitle: "Outros Artigos da Série",
            repoTitlePT: "Código-Fonte no GitHub",
            repoDescPT: "Explore a implementação completa, arquivos de configuração e suíte de testes em Go diretamente no repositório oficial.",
            repoCtaPT: "Ver Repositório",
            repoTitleEN: "Source Code on GitHub",
            repoDescEN: "Explore the complete high-performance implementation, Go tests, and configuration schemas in the official repository.",
            repoCtaEN: "View Repository",
            notFoundTitle: "Artigo não encontrado",
            notFoundDesc: "O tópico de telemetria solicitado não pôde ser localizado."
        }
    },
    "en": {
        nav: {
            about: "About",
            repositories: "Repositories",
            articles: "Articles",
            contact: "Contact"
        },
        about: {
            title: "Wesley Lima",
            subtitle: "Software Engineer | Technical Leader",
            desc: "Software Engineer with 20 years of experience in backend, frontend, mobile applications, and large-scale distributed systems architecture. Specialist in building high-availability solutions, advanced telemetry, systemic resilience, TDD, and practical Generative AI integrations.",
            capabilitiesTitle: "Capabilities Summary",
            capabilities: [
                {
                    title: "Systems Architecture",
                    desc: "Design and evolution of large-scale distributed systems, microservices, event-driven architecture (Kafka/RabbitMQ/NATS), high availability, resilience, and multi-tenant SaaS platforms."
                },
                {
                    title: "Development Conception",
                    desc: "Full software development lifecycle and technical leadership. Consolidated experience delivering high-scale solutions for brands like Google, Raízen, Folha de S.Paulo, Valor Econômico, and Pearson."
                },
                {
                    title: "Quality & Testing",
                    desc: "Systematic adoption of TDD (Test-Driven Development) to guarantee code maintainability, decoupled design (SOLID), and continuous performance tuning."
                },
                {
                    title: "Mobile & Web Applications",
                    desc: "Robust frontend and cross-platform mobile development safely integrated with resilient cloud-hosted APIs (Azure, AWS, GCP)."
                },
                {
                    title: "Generative AI & Agents",
                    desc: "Active work over the last 4 years designing practical solutions with LLMs, RAG (Retrieval-Augmented Generation) architectures, AI-driven automation, and autonomous agents."
                }
            ],
            timelineTitle: "Professional Timeline",
            timeline: [
                {
                    role: "Tech Lead & Senior Full Stack Engineer",
                    company: "Orangebox Technology / Oramont Businesstech",
                    period: "May 2025 - ",
                    desc: "Led architectural decisions, technical design, and implemented observability strategies (telemetry and distributed tracing) to ensure project resilience. Restructured engineering teams and optimized workflows, controlling Lead/Cycle Time metrics using historical Throughput for predictable deliveries. Developed Generative AI solutions and intelligent agents with Python (LangChain/FastAPI), integrating LLMs into corporate applications with Node.js, Kotlin, Go, and React.",
                    tech: ["Python", "LangChain", "FastAPI", "Node.js", "Kotlin", "Go", "React", "Ruby on Rails", "C#"],
                    refName: "Diego Mondego (CEO)",
                    refLink: "https://www.linkedin.com/in/diego-mondego/",
                    refSite: "https://oramont.com/",
                    refEmail: "diego@oramont.com"
                },
                {
                    role: "Senior Full Stack Engineer & Tech Lead",
                    company: "Digital Pages",
                    period: "Aug 2011 - Apr 2025",
                    desc: "Successfully transitioned legacy monoliths to microservices and Event-Driven architecture using brokers like Kafka, RabbitMQ, Redis, and AWS SQS/SNS, supporting 20,000+ concurrent users for clients like Google, Cogna, Raízen, Folha de S.Paulo, Valor Econômico, Editora Abril, and Pearson. Modernized on-premises infrastructures to AWS, Azure, and GCP using Terraform (IaC). Led engineering teams and reduced Lead/Cycle Time by 30% using historical Throughput. Active mentoring and PDIs. Implemented OpenTelemetry, Grafana, and TDD.",
                    tech: ["Ruby on Rails", "C#", "Java (Spring Boot)", "Golang", "Python", "Node.js", "PHP", "React", "Next.js", "Angular", "Vue", "Azure", "AWS", "GCP", "Terraform", "Kafka", "RabbitMQ", "Redis", "OpenTelemetry"],
                    refName: "Youssef Mourad (CEO)",
                    refLink: "https://www.linkedin.com/in/youssef-mourad-449346/",
                    refSite: "https://www.digitalpages.com.br/",
                    refEmail: "youssef.mourad@digitalpages.com.br"
                },
                {
                    role: "Mid-level Ruby Developer",
                    company: "Maya Comunicação",
                    period: "Feb 2011 - Jul 2011",
                    desc: "Developed web applications using Ruby on Rails and handled evolutionary maintenance of corporate systems.",
                    tech: ["Ruby on Rails", "MySQL", "JavaScript", "CSS", "HTML"]
                },
                {
                    role: "Mid-level Ruby Developer",
                    company: "Publi9",
                    period: "Aug 2010 - Feb 2011",
                    desc: "Developed new features and maintained Ruby on Rails applications.",
                    tech: ["Ruby on Rails", "MySQL", "JavaScript", "CSS", "HTML"]
                },
                {
                    role: "Junior ASP / .NET Developer",
                    company: "Grupo Inova",
                    period: "Jan 2010 - Aug 2010",
                    desc: "Developed web applications using ASP.NET and maintained integrations and internal corporate systems.",
                    tech: ["ASP.NET", "C#", "SQL Server", "HTML", "CSS", "JavaScript"]
                },
                {
                    role: "Junior PHP and Ruby Developer",
                    company: "Temmais.com / TV Tem (Rede Globo Affiliate)",
                    period: "Oct 2008 - Oct 2009",
                    desc: "Developed web features and maintained high-traffic content portals in PHP and Ruby.",
                    tech: ["PHP", "Ruby", "MySQL", "JavaScript", "HTML", "CSS"]
                },
                {
                    role: "Developer",
                    company: "Excelência Global Ltda",
                    period: "Feb 2006 - Sep 2008",
                    desc: "Developed, supported, and evolved internal corporate systems.",
                    tech: ["PHP", "MySQL", "JavaScript", "HTML", "CSS", "SQL Server"]
                }
            ]
        },
        repositories: {
            heading: "Projects & Repositories",
            items: [
                {
                    title: "orkai-observability",
                    url: "https://github.com/wesleyskap/orkai-observability",
                    description: "Ultra-performance observability library developed in Go. Designed to provide reflection-free JSON logging and dynamic LIFO tracing with near-zero heap allocations.",
                    tech: ["Go", "OpenTelemetry", "Performance Tuning"]
                },
                {
                    title: "onkai-unified-bus",
                    url: "https://github.com/wesleyskap/onkai-unified-bus",
                    description: "Unified asynchronous concurrent event bus in Go. Implements goroutine pools, flow control via Backpressure, and decoupled drivers for RabbitMQ, NATS, and Kafka.",
                    tech: ["Go", "RabbitMQ", "NATS", "Kafka", "Concurrency"]
                },
                {
                    title: "abacos-ruby",
                    url: "https://github.com/wesleyskap/abacos-ruby",
                    description: "Official Ruby integration for the Ábacos ERP. Facilitates order, inventory, and billing data mapping for complex e-commerce ecosystems.",
                    tech: ["Ruby", "ERP Integration", "E-commerce"]
                },
                {
                    title: "b2w-ruby",
                    url: "https://github.com/wesleyskap/b2w-ruby",
                    description: "Ruby SDK for catalog, price, and inventory synchronization with the B2W marketplace API (Americanas, Submarino, Shoptime).",
                    tech: ["Ruby", "Marketplace API", "Integrations"]
                },
                {
                    title: "orkai-runiq",
                    url: "https://github.com/wesleyskap/orkai-runiq",
                    description: "High-performance concurrent stream filter in Go for duplicate key removal in massive real-time pipelines.",
                    tech: ["Go", "Concurrency", "Data Pipelines"]
                },
                {
                    title: "shared_broker",
                    url: "https://github.com/wesleyskap/shared_broker",
                    description: "Ruby gem for messaging bus decoupling and resilience. Implements the Adapter pattern (InMemory, RabbitMQ, Kafka, Redis), exponential backoff retries, DLQ, and thread-safe Circuit Breakers.",
                    tech: ["Ruby", "RabbitMQ", "Kafka", "Resilience"]
                },
                {
                    title: "bseller-ruby",
                    url: "https://github.com/wesleyskap/bseller_ruby",
                    description: "Ruby integration for the BSeller (B2W) ecosystem. Enables fast synchronization of product catalogs, orders, inventory, and invoicing for e-commerce websites.",
                    tech: ["Ruby", "E-commerce", "Integrations"]
                },
                {
                    title: "extra-ruby",
                    url: "https://github.com/wesleyskap/extra_ruby",
                    description: "Ruby library for communicating with the Extra (Via Varejo) marketplace API, automating freight calculations, pricing management, and delivery tracking.",
                    tech: ["Ruby", "Marketplace API", "Integrations"]
                }
            ]
        },
        contact: {
            title: "Professional Contact",
            desc: "Consulting in architecture, microservices, observability, and telemetry. Development and technical leadership... get in touch.",
            directTitle: "Direct Channels"
        },
        blog: {
            heading: "Technical Ledger",
            authorLabel: "By",
            readTimeLabel: "read",
            backLabel: "Back",
            seriesLabel: "Series",
            relatedTitle: "Other Articles in the Series",
            repoTitlePT: "Código-Fonte no GitHub",
            repoDescPT: "Explore a implementação completa, arquivos de configuração e suíte de testes em Go diretamente no repositório oficial.",
            repoCtaPT: "Ver Repositório",
            repoTitleEN: "Source Code on GitHub",
            repoDescEN: "Explore the complete high-performance implementation, Go tests, and configuration schemas in the official repository.",
            repoCtaEN: "View Repository",
            notFoundTitle: "Article Not Found",
            notFoundDesc: "The requested telemetry topic could not be resolved."
        }
    }
};

/* ==========================================================================
   SOLID UTILITIES & SERVICES
   ========================================================================== */

class DateUtils {
    static parseDate(dateStr) {
        if (!dateStr) return new Date(0);
        const cleanStr = dateStr.toLowerCase()
            .replace(" de ", " ")
            .replace(",", "");
        
        const months = {
            "janeiro": "jan", "january": "jan", "jan": "jan",
            "fevereiro": "feb", "february": "feb", "feb": "feb",
            "março": "mar", "march": "mar", "mar": "mar",
            "abril": "apr", "april": "apr", "apr": "apr",
            "maio": "may", "may": "may",
            "junho": "jun", "june": "jun", "jun": "jun",
            "julho": "jul", "july": "jul", "jul": "jul",
            "agosto": "aug", "august": "aug", "aug": "aug",
            "setembro": "sep", "september": "sep", "sep": "sep",
            "outubro": "oct", "october": "oct", "oct": "oct",
            "novembro": "nov", "november": "nov", "nov": "nov",
            "dezembro": "dec", "december": "dec", "dec": "dec"
        };
        
        const parts = cleanStr.split(/\s+/);
        if (parts.length < 3) return new Date(0);
        
        let day, monthName, year;
        
        if (!isNaN(parts[0])) {
            day = parseInt(parts[0], 10);
            monthName = parts[1];
            year = parseInt(parts[2], 10);
        } else {
            monthName = parts[0];
            day = parseInt(parts[1], 10);
            year = parseInt(parts[2], 10);
        }
        
        const engMonth = months[monthName] || "jan";
        return new Date(`${engMonth} ${day}, ${year}`);
    }
}

class TranslationService {
    constructor(defaultLocale = "pt-BR") {
        this.locale = localStorage.getItem("wesley-locale") || defaultLocale;
    }

    init(onLocaleChangeCallback) {
        const localeSelector = document.getElementById("locale-selector");
        if (localeSelector) {
            localeSelector.value = this.locale;
            localeSelector.addEventListener("change", (e) => {
                this.setLocale(e.target.value);
                if (onLocaleChangeCallback) onLocaleChangeCallback();
            });
        }
        this.translateNavigation();
    }

    setLocale(locale) {
        this.locale = locale;
        localStorage.setItem("wesley-locale", locale);
        this.translateNavigation();
    }

    getContent() {
        return PORTFOLIO_CONTENT[this.locale];
    }

    translateNavigation() {
        const navTexts = this.getContent().nav;
        document.getElementById("link-about").innerText = navTexts.about;
        document.getElementById("link-repositories").innerText = navTexts.repositories;
        document.getElementById("link-articles").innerText = navTexts.articles;
        document.getElementById("link-contact").innerText = navTexts.contact;

        const subtitleEl = document.getElementById("main-subtitle");
        if (subtitleEl) {
            subtitleEl.innerText = this.locale === "pt-BR" ? "Engenheiro de Software" : "Software Engineer";
        }
    }
}

class ThemeManager {
    init() {
        const toggleBtn = document.getElementById("theme-toggle");
        const savedTheme = localStorage.getItem("wesley-theme") || "dark-theme";
        document.body.className = savedTheme;
        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => this.toggleTheme());
        }
    }

    toggleTheme() {
        if (document.body.classList.contains("dark-theme")) {
            document.body.className = "light-theme";
            localStorage.setItem("wesley-theme", "light-theme");
        } else {
            document.body.className = "dark-theme";
            localStorage.setItem("wesley-theme", "dark-theme");
        }
    }
}

class MarkdownParser {
    static parseFrontMatter(text) {
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!match) return { metadata: {}, body: text };
        
        const yaml = match[1];
        const body = match[2];
        const metadata = {};
        yaml.split('\n').forEach(line => {
            const index = line.indexOf(':');
            if (index > -1) {
                const key = line.substring(0, index).trim();
                const value = line.substring(index + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                metadata[key] = value;
            }
        });
        return { metadata, body };
    }

    parseMarkdown(text) {
        let html = text;

        html = html.replace("[DIAGRAM_DOUBLE_ROUTING]", `
            <div class="mermaid-container">
                <div class="card-meta" style="justify-content: center;">Fluxo de Roteamento Duplo</div>
                <div style="font-family: var(--font-mono); font-size: 13px; color: var(--text-secondary); text-align: left; max-width: 500px; margin: 0 auto; line-height: 1.8;">
                    <strong>1. Chamada:</strong> observability.RecordLatency("payment", 120ms)<br>
                    <strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&bull; Rota A:</strong> Grava no engine local na Memória (Scrapable /metrics)<br>
                    <strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&bull; Rota B:</strong> Converte e envia ao OpenTelemetry Instrument nativo<br>
                    <strong>2. Destinos:</strong> Prometheus local scrape & Datadog/Grafana OTel Collector
                </div>
            </div>
        `);

        html = html.replace("[DIAGRAM_CIRCUIT_BREAKER]", `
            <div class="mermaid-container">
                <div class="card-meta" style="justify-content: center;">Máquina de Estados de Proteção</div>
                <div style="font-family: var(--font-mono); font-size: 13px; color: var(--text-secondary); text-align: left; max-width: 500px; margin: 0 auto; line-height: 1.8;">
                    <strong>CLOSED (Fechado):</strong> Requisições passam. Monitora erros.<br>
                    <strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&bull; Se erros &ge; limiar:</strong> Transiciona para OPEN (Falha Rápida)<br>
                    <strong>OPEN (Aberto):</strong> Bloqueia tudo imediatamente em RAM.<br>
                    <strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&bull; Se cooldown expira:</strong> Transiciona para HALF-OPEN<br>
                    <strong>HALF-OPEN:</strong> Roda requisições de testes.<br>
                    <strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&bull; Se falha:</strong> Retorna para OPEN. Se sucesso: Retorna para CLOSED.
                </div>
            </div>
        `);

        html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
        html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");

        html = html.replace(/\`\`\`([a-zA-Z0-9\-]+)?\r?\n([\s\S]*?)\`\`\`/g, (match, lang, code) => {
            const displayLang = lang ? lang.trim().toLowerCase() : 'code';
            let highlighted = code
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            
            if (displayLang === 'go') {
                const strings = [];
                const comments = [];

                highlighted = highlighted.replace(/(".*?")/g, (m) => {
                    strings.push(`<span class="code-str">${m}</span>`);
                    return `___STR_PLACEHOLDER_${strings.length - 1}___`;
                });

                highlighted = highlighted.replace(/(\/\/.*)/g, (m) => {
                    comments.push(`<span class="code-cmt">${m}</span>`);
                    return `___CMT_PLACEHOLDER_${comments.length - 1}___`;
                });

                highlighted = highlighted.replace(/\b(func|type|struct|interface|package|import|return|defer|go|select|case|const|var|if|else|for|range)\b/g, '<span class="code-key">$1</span>');
                highlighted = highlighted.replace(/\b(string|int|float64|bool|error|time\.Time|time\.Duration|sync\.Mutex)\b/g, '<span class="code-tp">$1</span>');

                highlighted = highlighted.replace(/___CMT_PLACEHOLDER_(\d+)___/g, (m, index) => comments[parseInt(index, 10)]);
                highlighted = highlighted.replace(/___STR_PLACEHOLDER_(\d+)___/g, (m, index) => strings[parseInt(index, 10)]);
            } else if (displayLang === 'http') {
                highlighted = highlighted.replace(/\b(QUERY|GET|POST|HTTP\/1\.1|HTTP\/2|Host:|Content-Type:|Accept:|Content-Location:|Location:|Last-Modified:|Date:|ETag:|If-None-Match:|Allow:|Accept-Query:)\b/g, '<span class="code-key">$1</span>');
            } else if (displayLang === 'ruby') {
                const strings = [];
                const comments = [];
                highlighted = highlighted.replace(/(".*?"|'.*?')/g, (m) => {
                    strings.push(`<span class="code-str">${m}</span>`);
                    return `___STR_PLACEHOLDER_${strings.length - 1}___`;
                });
                highlighted = highlighted.replace(/(#.*)/g, (m) => {
                    comments.push(`<span class="code-cmt">${m}</span>`);
                    return `___CMT_PLACEHOLDER_${comments.length - 1}___`;
                });
                highlighted = highlighted.replace(/\b(def|end|class|module|require|include|raise|initialize|if|else|elsif|unless|while|until|for|in|return|yield)\b/g, '<span class="code-key">$1</span>');
                highlighted = highlighted.replace(/___CMT_PLACEHOLDER_(\d+)___/g, (m, index) => comments[parseInt(index, 10)]);
                highlighted = highlighted.replace(/___STR_PLACEHOLDER_(\d+)___/g, (m, index) => strings[parseInt(index, 10)]);
            }

            return `<div class="code-block-wrapper">
                        <div class="code-block-header">
                            <span class="code-block-lang">${displayLang}</span>
                        </div>
                        <pre><code>${highlighted.trim()}</code></pre>
                    </div>`;
        });

        // Parse markdown tables
        const lines = html.split('\n');
        let inTable = false;
        let tableHeader = [];
        let tableRows = [];
        const newLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|') && line.endsWith('|')) {
                const cells = line.split('|').slice(1, -1).map(c => c.trim());
                if (!inTable) {
                    const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
                    if (nextLine.startsWith('|') && nextLine.includes('---')) {
                        inTable = true;
                        tableHeader = cells;
                        i++; // skip delimiter line
                        tableRows = [];
                    } else {
                        newLines.push(lines[i]);
                    }
                } else {
                    tableRows.push(cells);
                }
            } else {
                if (inTable) {
                    let tableHTML = '<div class="table-wrapper"><table><thead><tr>';
                    tableHeader.forEach(h => {
                        tableHTML += `<th>${h}</th>`;
                    });
                    tableHTML += '</tr></thead><tbody>';
                    tableRows.forEach(row => {
                        tableHTML += '<tr>';
                        for (let c = 0; c < tableHeader.length; c++) {
                            tableHTML += `<td>${row[c] || ''}</td>`;
                        }
                        tableHTML += '</tr>';
                    });
                    tableHTML += '</tbody></table></div>';
                    newLines.push(tableHTML);
                    inTable = false;
                }
                newLines.push(lines[i]);
            }
        }
        if (inTable) {
            let tableHTML = '<table><thead><tr>';
            tableHeader.forEach(h => {
                tableHTML += `<th>${h}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';
            tableRows.forEach(row => {
                tableHTML += '<tr>';
                for (let c = 0; c < tableHeader.length; c++) {
                    tableHTML += `<td>${row[c] || ''}</td>`;
                }
                tableHTML += '</tr>';
            });
            tableHTML += '</tbody></table>';
            newLines.push(tableHTML);
        }
        html = newLines.join('\n');

        html = html.replace(/^---$/gim, "<hr />");
        html = html.replace(/\`([\s\S]*?)\`/g, "<code>$1</code>");
        html = html.replace(/^[\-\*]\s+(.*$)/gim, '<li class="task-li-u">$1</li>');
        html = html.replace(/^\d+\.\s+(.*$)/gim, '<li class="task-li-o">$1</li>');
        html = html.replace(/((?:<li class="task-li-u">.*<\/li>\r?\n?)+)/g, "<ul>$1</ul>");
        html = html.replace(/<li class="task-li-u">/g, "<li>");
        html = html.replace(/((?:<li class="task-li-o">.*<\/li>\r?\n?)+)/g, "<ol>$1</ol>");
        html = html.replace(/<li class="task-li-o">/g, "<li>");
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
        html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; font-weight: 600;">$1</a>');

        return html;
    }
}

class ApiClient {
    constructor(translationService) {
        this.translationService = translationService;
    }

    async fetchRegistry() {
        const response = await fetch(`./posts/${this.translationService.locale}/registry.json?t=${Date.now()}`);
        if (!response.ok) throw new Error("Registry fetch failed");
        const posts = await response.json();
        return posts.sort((a, b) => DateUtils.parseDate(b.date) - DateUtils.parseDate(a.date));
    }

    async fetchPost(postId) {
        const response = await fetch(`./posts/${this.translationService.locale}/${postId}.md?t=${Date.now()}`);
        if (!response.ok) throw new Error("Post fetch failed");
        const rawText = await response.text();
        const { metadata, body } = MarkdownParser.parseFrontMatter(rawText);
        return {
            id: postId,
            title: metadata.title || "",
            excerpt: metadata.excerpt || "",
            category: metadata.category || "",
            date: metadata.date || "",
            readTime: metadata.readTime || "",
            author: metadata.author || "",
            series: metadata.series || "",
            seriesIndex: parseInt(metadata.seriesIndex || "0", 10),
            referenceLink: metadata.referenceLink || null,
            body: body
        };
    }
}

class ViewRenderer {
    constructor(translationService, markdownParser) {
        this.translationService = translationService;
        this.markdownParser = markdownParser;
        this.viewport = document.getElementById("app-viewport");
    }

    renderAbout(latestPostsHTML = "") {
        const data = this.translationService.getContent().about;

        let capabilitiesHTML = "";
        data.capabilities.forEach(cap => {
            capabilitiesHTML += `
                <div class="capability-item">
                    <h3 class="capability-title">${cap.title}</h3>
                    <p class="capability-desc">${cap.desc}</p>
                </div>
            `;
        });

        let timelineHTML = "";
        data.timeline.forEach(item => {
            let techHTML = "";
            if (item.tech) {
                item.tech.forEach(t => {
                    techHTML += `<span class="case-tech-tag">${t}</span>`;
                });
            }
            const labelText = this.translationService.locale === "pt-BR" ? "Linguagens & Tecnologias" : "Languages & Tech";
            
            let refHTML = "";
            if (item.refLink && item.refEmail) {
                const label = this.translationService.locale === "pt-BR" ? "Indicação" : "Recommendation";
                const refDisplayName = item.refName ? `${item.refName} - ` : "";
                const andText = this.translationService.locale === "pt-BR" ? " e " : " and ";
                refHTML = `
                    <div class="timeline-recommendation" style="margin-top: 12px; font-size: 13px; color: var(--text-secondary);">
                        <strong style="color: var(--accent); font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;">${label}:</strong> 
                        <span>${refDisplayName}</span>
                        <a href="${item.refLink}" target="_blank" rel="noopener noreferrer" style="color: var(--text-primary); text-decoration: none; border-bottom: 1px dotted var(--accent); font-weight: 500;">linkedin</a>${andText}
                        <a href="mailto:${item.refEmail}" style="color: var(--text-primary); text-decoration: none; border-bottom: 1px dotted var(--accent); font-weight: 500;">email</a>
                    </div>
                `;
            }

            const siteHTML = item.refSite ? `
                <div class="timeline-company-site" style="margin-top: -8px; margin-bottom: 12px; font-size: 13px;">
                    <a href="${item.refSite}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; font-family: var(--font-mono); font-size: 12px;">${item.refSite.replace('https://', '').replace('www.', '').replace(/\/$/, '')} &rarr;</a>
                </div>
            ` : "";

            timelineHTML += `
                <div class="timeline-item">
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <h3 class="timeline-role">${item.role}</h3>
                            <span class="timeline-period">${item.period}</span>
                        </div>
                        <div class="timeline-company">${item.company}</div>
                        ${siteHTML}
                        <p class="timeline-desc">${item.desc}</p>
                        ${refHTML}
                        ${techHTML ? `
                            <div class="timeline-tech-section" style="margin-top: 16px;">
                                <div class="timeline-tech-label">${labelText}</div>
                                <div class="case-tech-deck">${techHTML}</div>
                            </div>
                        ` : ""}
                    </div>
                </div>
            `;
        });

        this.viewport.innerHTML = `
            <section class="profile-section" style="padding-top: 0;">
                <div class="bio-and-posts-container">
                    <div class="bio-section-left">
                        <p class="profile-description">${data.desc}</p>

                        <div class="profile-contact-bar">
                            <a href="mailto:wesleyskap@gmail.com" class="profile-contact-item">
                                <svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                                <span>wesleyskap@gmail.com</span>
                            </a>
                            <a href="https://wa.me/5511936182375" target="_blank" rel="noopener noreferrer" class="profile-contact-item whatsapp-item">
                                <svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                                </svg>
                                <span>(11) 93618-2375</span>
                            </a>
                        </div>
                    </div>

                    <div class="posts-section-right">
                        <h2 class="section-heading">Post</h2>
                        <div class="latest-posts-list">
                            ${latestPostsHTML || `<div style="font-size: 14px; color: var(--text-muted);">${this.translationService.locale === 'pt-BR' ? 'Sem posts disponíveis.' : 'No posts available.'}</div>`}
                        </div>
                        <div style="margin-top: 12px;">
                            <a href="#articles" style="font-family: var(--font-mono); font-size: 12px; color: var(--accent); text-decoration: none; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">${this.translationService.locale === 'pt-BR' ? 'todos' : 'all'} &rarr;</a>
                        </div>
                    </div>
                </div>

                <h2 class="section-heading" style="margin-top: 48px; font-size: 26px;">${data.capabilitiesTitle}</h2>
                <div class="capabilities-grid">
                    ${capabilitiesHTML}
                </div>

                <h2 class="section-heading" style="margin-top: 64px; font-size: 26px;">${data.timelineTitle}</h2>
                <div class="timeline">
                    ${timelineHTML}
                </div>
            </section>
        `;
    }

    renderRepositories() {
        const data = this.translationService.getContent().repositories;

        let itemsHTML = "";
        data.items.forEach(item => {
            let techHTML = "";
            item.tech.forEach(t => {
                techHTML += `<span class="case-tech-tag">${t}</span>`;
            });

            itemsHTML += `
                <div class="case-card">
                    <div class="case-header">
                        <h3 class="case-title" style="font-family: var(--font-mono); color: var(--accent); font-size: 20px;">${item.title}</h3>
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="meta-cta-btn" style="padding: 6px 14px; font-size: 13px; box-shadow: none;">GitHub &rarr;</a>
                    </div>
                    
                    <div class="case-details" style="margin-top: 12px;">
                        <p class="case-block-desc" style="font-size: 15px;">${item.description}</p>
                    </div>
                    
                    <div class="case-tech-deck" style="margin-top: 16px;">
                        ${techHTML}
                    </div>
                </div>
            `;
        });

        this.viewport.innerHTML = `
            <section class="cases-section">
                <h2 class="section-heading">${data.heading}</h2>
                <div class="cases-grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));">
                    ${itemsHTML}
                </div>
            </section>
        `;
    }

    renderArticles(posts) {
        const blogTexts = this.translationService.getContent().blog;

        let articlesHTML = "";
        posts.forEach(post => {
            let seriesMetaHTML = "";
            if (post.series) {
                let seriesTitle = "Orkai Observability";
                if (post.series === "onkai-unified-bus-series") {
                    seriesTitle = "Onkai Unified Bus";
                } else if (post.series === "shared-broker-series") {
                    seriesTitle = "Shared Broker";
                } else if (post.series === "http-query-series") {
                    seriesTitle = "HTTP Query";
                } else if (post.series === "vindi-rails-series") {
                    seriesTitle = "Vindi Rails";
                } else if (post.series === "orkai-runiq-series") {
                    seriesTitle = "Orkai Runiq";
                } else if (post.series === "rails-ai-agents-series") {
                    seriesTitle = "Rails AI Agents";
                }
                seriesMetaHTML = `
                    <span>&bull;</span>
                    <span>${seriesTitle} (${post.seriesIndex})</span>
                `;
            }

            articlesHTML += `
                <article class="article-card" onclick="window.location.hash = '#post/${post.id}'">
                    <div>
                        <div class="card-meta">
                            <span class="card-category">${post.category}</span>
                            ${seriesMetaHTML}
                        </div>
                        <h3 class="card-title">${post.title}</h3>
                        <p class="card-excerpt">${post.excerpt}</p>
                    </div>
                    <div class="card-footer">
                        <span>${blogTexts.authorLabel} <strong>${post.author}</strong></span>
                        <span class="card-readtime">${post.readTime}</span>
                    </div>
                </article>
            `;
        });

        this.viewport.innerHTML = `
            <section class="articles-section">
                <h2 class="section-heading">${blogTexts.heading}</h2>
                <div class="articles-grid">
                    ${articlesHTML}
                </div>
            </section>
        `;
    }

    renderContact() {
        const data = this.translationService.getContent().contact;

        this.viewport.innerHTML = `
            <section class="handshake-section">
                <div class="handshake-card">
                    <h2 class="handshake-title">${data.title}</h2>
                    <p class="handshake-desc" style="margin-bottom: 24px;">${data.desc}</p>
                    
                    <div class="contact-channels-container">
                        <h3 class="channels-heading">${data.directTitle}</h3>
                        <div class="contact-channels">
                            <a href="mailto:wesleyskap@gmail.com" class="channel-card">
                                <div class="channel-icon-wrapper">
                                    <svg class="channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                        <polyline points="22,6 12,13 2,6"></polyline>
                                    </svg>
                                </div>
                                <div class="channel-details">
                                    <span class="channel-label">E-mail</span>
                                    <span class="channel-value">wesleyskap@gmail.com</span>
                                </div>
                            </a>
                            <a href="https://wa.me/5511936182375" target="_blank" rel="noopener noreferrer" class="channel-card">
                                <div class="channel-icon-wrapper whatsapp-theme">
                                    <svg class="channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                                    </svg>
                                </div>
                                <div class="channel-details">
                                    <span class="channel-label">WhatsApp</span>
                                    <span class="channel-value">(11) 93618-2375</span>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    renderPostDetail(post, registry = []) {
        const blogTexts = this.translationService.getContent().blog;

        if (!post) {
            this.viewport.innerHTML = `
                <div class="post-detail-section" style="text-align: center;">
                    <h1 class="post-title">${blogTexts.notFoundTitle}</h1>
                    <p>${blogTexts.notFoundDesc}</p>
                    <button class="back-btn" onclick="window.location.hash = '#articles'">${blogTexts.backLabel}</button>
                </div>
            `;
            return;
        }

        const renderedBody = this.markdownParser.parseMarkdown(post.body);
        let referenceHTML = "";
        if (post.referenceLink) {
            const isGitHub = post.referenceLink.includes("github.com");
            let title, desc, cta, iconHTML;
            if (isGitHub) {
                title = this.translationService.locale === "pt-BR" ? blogTexts.repoTitlePT : blogTexts.repoTitleEN;
                desc = this.translationService.locale === "pt-BR" ? blogTexts.repoDescPT : blogTexts.repoDescEN;
                cta = this.translationService.locale === "pt-BR" ? blogTexts.repoCtaPT : blogTexts.repoCtaEN;
                iconHTML = `
                    <svg class="repo-cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                    </svg>
                `;
            } else {
                title = this.translationService.locale === "pt-BR" ? "Referência Oficial" : "Official Reference";
                desc = this.translationService.locale === "pt-BR" 
                    ? "Consulte a documentação técnica oficial, RFCs ou materiais de referência sobre este tópico." 
                    : "Access the official technical specifications, RFCs, or reference documentation related to this topic.";
                cta = this.translationService.locale === "pt-BR" ? "Ver Referência" : "View Reference";
                iconHTML = `
                    <svg class="repo-cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                `;
            }
            referenceHTML = `
                <div class="repo-cta-card">
                    <div class="repo-cta-content">
                        <h4 class="repo-cta-title">${title}</h4>
                        <p class="repo-cta-desc">${desc}</p>
                    </div>
                    <a href="${post.referenceLink}" target="_blank" rel="noopener noreferrer" class="repo-cta-link">
                        ${iconHTML}
                        ${cta}
                    </a>
                </div>
            `;
        }

        const related = post.series ? registry
            .filter(p => p.series === post.series && p.id !== post.id)
            .sort((a, b) => DateUtils.parseDate(b.date) - DateUtils.parseDate(a.date)) : [];
        
        let relatedHTML = "";
        related.forEach(rel => {
            relatedHTML += `
                <div class="related-card" onclick="window.location.hash = '#post/${rel.id}'">
                    <div class="card-meta">
                        <span class="card-category">${this.translationService.locale === "pt-BR" ? "Parte" : "Part"} ${rel.seriesIndex}</span>
                    </div>
                    <h4 class="related-card-title">${rel.title}</h4>
                </div>
            `;
        });

        let seriesText = "";
        if (post.series === "onkai-unified-bus-series") {
            seriesText = "Onkai Unified Bus";
        } else if (post.series === "shared-broker-series") {
            seriesText = "Shared Broker";
        } else if (post.series === "orkai-observability-series") {
            seriesText = "Orkai Observability";
        } else if (post.series === "http-query-series") {
            seriesText = "HTTP Query";
        } else if (post.series === "vindi-rails-series") {
            seriesText = "Vindi Rails";
        } else if (post.series === "orkai-runiq-series") {
            seriesText = "Orkai Runiq";
        } else if (post.series === "rails-ai-agents-series") {
            seriesText = "Rails AI Agents";
        }

        const seriesBadgeHTML = post.series && seriesText ? `<span class="post-series-badge">${blogTexts.seriesLabel}: ${seriesText}</span>` : "";

        this.viewport.innerHTML = `
            <section class="post-detail-section">
                <div class="back-btn-container">
                    <button class="back-btn" onclick="window.location.hash = '#articles'">
                        &larr; ${blogTexts.backLabel}
                    </button>
                </div>

                <article class="post-full">
                    <header class="post-header">
                        ${seriesBadgeHTML}
                        <h1 class="post-title">${post.title}</h1>
                        <div class="post-meta-strip">
                            <span class="post-meta-item">${this.translationService.locale === "pt-BR" ? "Autor" : "Author"}: <strong>${post.author}</strong></span>
                            <span>&bull;</span>
                            <span class="post-meta-item">${this.translationService.locale === "pt-BR" ? "Publicado em" : "Published on"}: <strong>${post.date}</strong></span>
                            <span>&bull;</span>
                            <span class="post-meta-item">${post.readTime}</span>
                        </div>
                    </header>

                    <div class="post-body">
                        ${renderedBody}
                    </div>

                    ${referenceHTML}

                    ${related.length > 0 ? `
                        <div class="related-posts-section">
                            <h3 class="related-title">${blogTexts.relatedTitle}</h3>
                            <div class="related-grid">
                                ${relatedHTML}
                            </div>
                        </div>
                    ` : ""}
                </article>
            </section>
        `;
    }

    renderConnectionError(retryCallback) {
        this.viewport.innerHTML = `
            <div class="coming-soon-card" style="max-width: 500px; margin: 80px auto; text-align: center; border: 1px solid var(--border-color); padding: 40px var(--spacing-lg);">
                <div style="font-size: 48px; margin-bottom: var(--spacing-sm);">📡</div>
                <h3>${this.translationService.locale === "pt-BR" ? "Erro de Conexão" : "Connection Error"}</h3>
                <p style="margin-bottom: 24px;">
                    ${this.translationService.locale === "pt-BR" 
                        ? "Não foi possível carregar os dados. Verifique o servidor local." 
                        : "Could not fetch data. Verify your local server."}
                </p>
                <button class="back-btn" id="retry-fetch-btn">${this.translationService.locale === "pt-BR" ? "Tentar Novamente" : "Retry Connection"}</button>
            </div>
        `;
        document.getElementById("retry-fetch-btn").addEventListener("click", () => {
            this.viewport.style.opacity = "0";
            setTimeout(() => {
                retryCallback();
                this.viewport.style.opacity = "1";
            }, 200);
        });
    }
}

class Router {
    constructor(translationService, apiClient, viewRenderer) {
        this.translationService = translationService;
        this.apiClient = apiClient;
        this.viewRenderer = viewRenderer;
        this.currentRoute = "about";
        this.activePostId = null;
    }

    init() {
        window.addEventListener("hashchange", () => this.handleRouting());
        this.handleRouting();
    }

    trackPageview(hash, title) {
        if (typeof window.gtag === "function") {
            const virtualPath = hash ? '/' + hash.replace('#', '') : '/about';
            window.gtag("config", "G-4Y4TJDMHXK", {
                page_path: virtualPath,
                page_title: title
            });
        }
    }

    handleRouting() {
        const hash = window.location.hash;
        const viewport = document.getElementById("app-viewport");
        if (viewport) viewport.style.opacity = "0";

        setTimeout(() => {
            let pageTitle = "Wesleyskap // Systems Engineer";
            if (!hash || hash === "" || hash === "#" || hash === "#about") {
                this.currentRoute = "about";
                this.activePostId = null;
                this.loadAbout();
            } else if (hash === "#repositories") {
                this.currentRoute = "repositories";
                this.activePostId = null;
                this.viewRenderer.renderRepositories();
                pageTitle = this.translationService.locale === "pt-BR" ? "Projetos & Repositórios // Wesleyskap" : "Projects & Repositories // Wesleyskap";
            } else if (hash === "#articles") {
                this.currentRoute = "articles";
                this.activePostId = null;
                this.loadArticles();
                pageTitle = this.translationService.locale === "pt-BR" ? "Artigos Técnicos // Wesleyskap" : "Technical Articles // Wesleyskap";
            } else if (hash === "#contact") {
                this.currentRoute = "contact";
                this.activePostId = null;
                this.viewRenderer.renderContact();
                pageTitle = this.translationService.locale === "pt-BR" ? "Contato Profissional // Wesleyskap" : "Professional Contact // Wesleyskap";
            } else if (hash.startsWith("#post/")) {
                this.currentRoute = "post-detail";
                this.activePostId = hash.replace("#post/", "");
                this.loadPostDetail(this.activePostId);
                pageTitle = ""; // Será definido dentro de loadPostDetail assincronamente
            } else {
                window.location.hash = "#about";
            }
            
            if (pageTitle) {
                document.title = pageTitle;
                this.trackPageview(hash || "#about", pageTitle);
            }
            this.syncNavLinks();
            if (viewport) viewport.style.opacity = "1";
        }, 150);
    }

    syncNavLinks() {
        const links = ["about", "repositories", "articles", "contact"];
        links.forEach(l => {
            const el = document.getElementById(`link-${l}`);
            if (el) {
                if (this.currentRoute === l) {
                    el.classList.add("active");
                } else {
                    el.classList.remove("active");
                }
            }
        });
    }

    async loadAbout() {
        let latestPostsHTML = "";
        try {
            const posts = await this.apiClient.fetchRegistry();
            const latestThree = posts.slice(0, 3);
            latestThree.forEach(post => {
                latestPostsHTML += `
                    <div class="latest-post-item" style="margin-bottom: 16px;">
                        <a href="#post/${post.id}" style="color: var(--text-primary); text-decoration: none; font-size: 15px; font-weight: 600; line-height: 1.4; transition: color 0.2s; display: block;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-primary)'">${post.title}</a>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-family: var(--font-mono);">${post.date} &bull; ${post.readTime}</div>
                    </div>
                `;
            });
        } catch (e) {
            console.error("Failed to load latest posts for homepage", e);
        }
        this.viewRenderer.renderAbout(latestPostsHTML);
    }

    async loadArticles() {
        try {
            const posts = await this.apiClient.fetchRegistry();
            this.viewRenderer.renderArticles(posts);
        } catch (err) {
            console.error("Failed to load articles:", err);
            const blogTexts = this.translationService.getContent().blog;
            const viewport = document.getElementById("app-viewport");
            if (viewport) {
                viewport.innerHTML = `
                    <section class="articles-section">
                        <h2 class="section-heading">${blogTexts.heading}</h2>
                        <div class="coming-soon-card" style="text-align: center; border: 1px solid var(--border-color); padding: 40px var(--spacing-lg);">
                            <h3>Failed to load articles index.</h3>
                        </div>
                    </section>
                `;
            }
        }
    }

    async loadPostDetail(postId) {
        try {
            const postData = await this.apiClient.fetchPost(postId);
            let registry = [];
            try {
                registry = await this.apiClient.fetchRegistry();
            } catch (e) {
                console.error("Failed to load registry for related posts:", e);
            }
            this.viewRenderer.renderPostDetail(postData, registry);
            
            const metadata = postData.metadata || {};
            if (metadata.title) {
                const pageTitle = `${metadata.title} // Wesleyskap`;
                document.title = pageTitle;
                this.trackPageview(window.location.hash, pageTitle);
            }
        } catch (err) {
            console.error("Failed to load post detail:", err);
            this.viewRenderer.renderConnectionError(() => this.loadPostDetail(postId));
        }
    }
}

/* ==========================================================================
   APPLICATION ENTRYPOINT
   ========================================================================== */

class App {
    constructor() {
        this.translationService = new TranslationService();
        this.themeManager = new ThemeManager();
        this.markdownParser = new MarkdownParser();
        this.apiClient = new ApiClient(this.translationService);
        this.viewRenderer = new ViewRenderer(this.translationService, this.markdownParser);
        this.router = new Router(this.translationService, this.apiClient, this.viewRenderer);
    }

    init() {
        this.themeManager.init();
        this.translationService.init(() => {
            this.router.handleRouting();
        });
        this.router.init();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const app = new App();
    app.init();
});
