---
title: "Data safety:Implementing regex-based pii masking and sanitization"
excerpt: "Leaking PII into log files violates regulations like GDPR and LGPD. Learn how to mask PII dynamically using Regex in Go."
category: "Performance"
date: "May 07, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 12
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## The threat of pii exposure in log files

When debugging, developers often print raw request payloads directly to application logs. However, these objects can contain sensitive customer data—such as social security numbers, credit card details, emails, passwords, or JWTs.

Recording this information in plain text violates data protection laws like GDPR in Europe or LGPD in Brazil, exposing the business to security breaches and compliance penalties.

To prevent this, the **orkai-observability** package features a sanitization utility based on **Regular Expressions (Regex)** that detects and masks sensitive values at runtime.

## Designing the regex pii sanitizer

We build a sanitization engine that scans logs and replaces matching pattern values with a protective mask (`[MASKED_PATTERN]`):

```go
package main

import (
	"regexp"
	"sync"
)

type PIISanitizer struct {
	mu       sync.RWMutex
	patterns map[string]*regexp.Regexp
}

func NewPIISanitizer() *PIISanitizer {
	s := &PIISanitizer{
		patterns: make(map[string]*regexp.Regexp),
	}
	// Basic regex pattern for social security numbers / CPFs
	s.RegisterPattern("CPF", `\d{3}\.?\d{3}\.?\d{3}-?\d{2}`)
	// Basic regex pattern for credit cards
	s.RegisterPattern("CreditCard", `\b(?:\d[ -]*?){13,16}\b`)
	
	return s
}

// RegisterPattern registers a new Regex pattern thread-safely
func (s *PIISanitizer) RegisterPattern(name, regexStr string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.patterns[name] = regexp.MustCompile(regexStr)
}

// Sanitize replaces matched sensitive strings with masking text
func (s *PIISanitizer) Sanitize(input string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	output := input
	for _, re := range s.patterns {
		output = re.ReplaceAllString(output, "[MASKED_PATTERN]")
	}
	return output
}
```

## Thread-safe dynamic sanitization

Because sanitization executes concurrently across request handlers, the sanitization engine utilizes a read-write lock (`sync.RWMutex`). This allows multiple goroutines to sanitize messages concurrently, blocking operations only when a new regex pattern is registered dynamically.

### Technical terms demystified
- **PII (Personally Identifiable Information):** Any information that can be used to identify a specific individual.
- **Regular Expression (Regex):** A special text syntax describing complex search and replace patterns.
- **RWMutex (Read-Write Mutex):** A concurrency lock that permits multiple reader threads to access data concurrently, but demands exclusive access for writers.
