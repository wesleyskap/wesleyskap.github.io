---
title: "Efficient Disk Writing: Building a Log File Rotation Writer Without Dependencies"
excerpt: "Writing logs to files indefinitely eventually saturates server disk storage. Learn how to design a thread-safe, concurrent log rotation writer in Go."
category: "Performance"
date: "Apr 25, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Hidden Risk of Infinite Log Files

Writing application logs to local files is a classic pattern in operations. However, if your API handles thousands of requests per minute, the log file grows rapidly. Within weeks, it can consume tens of gigabytes, exhausting your server's disk space and causing catastrophic application failures (such as the inability to write new data).

To prevent this, production applications use **Log Rotation**, dividing writes into multiple files of limited size and discarding or archiving the oldest ones automatically.

The **orkai-observability** package implements a thread-safe, concurrent, and lightweight rotating file writer in Go without external dependencies.

## Designing the RotatingFileWriter

The `RotatingFileWriter` manages the active log file under exclusive locks (`sync.Mutex`), tracking bytes written to trigger file rotation when the configured size limit is crossed:

```go
package main

import (
	"fmt"
	"os"
	"sync"
	"time"
)

type RotatingFileWriter struct {
	mu          sync.Mutex
	filename    string
	maxSize     int64 // Maximum file size in bytes (e.g., 10 * 1024 * 1024 for 10MB)
	currentSize int64
	file        *os.File
}

func NewRotatingWriter(filename string, maxSize int64) (*RotatingFileWriter, error) {
	writer := &RotatingFileWriter{
		filename: filename,
		maxSize:  maxSize,
	}
	if err := writer.openNew(); err != nil {
		return nil, err
	}
	return writer, nil
}

func (w *RotatingFileWriter) openNew() error {
	var err error
	w.file, err = os.OpenFile(w.filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return err
	}
	info, err := w.file.Stat()
	if err != nil {
		return err
	}
	w.currentSize = info.Size()
	return nil
}
```

## The Concurrent Rotation Logic

When we write bytes and the `currentSize` exceeds `maxSize`, we close the active file, rename it by appending a timestamp to its name, and open a new clean file:

```go
func (w *RotatingFileWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	writeLen := int64(len(b))
	if w.currentSize+writeLen > w.maxSize {
		if err := w.rotate(); err != nil {
			return 0, err
		}
	}

	n, err := w.file.Write(b)
	w.currentSize += int64(n)
	return n, err
}

func (w *RotatingFileWriter) rotate() error {
	_ = w.file.Close()

	// Formulates the rotated file name
	backupName := fmt.Sprintf("%s.%d.log", w.filename, time.Now().UnixNano())
	if err := os.Rename(w.filename, backupName); err != nil {
		return err
	}

	return w.openNew()
}
```

### Technical Terms Demystified
- **Log Rotation:** The practice of renaming and archiving old logs once they cross size or age limits.
- **Mutex (Mutual Exclusion):** A synchronization mechanism that ensures only one thread or goroutine accesses a shared resource at a time.
- **Timestamp:** A numeric or text representation of the exact date and time an event or file change occurred.
---
