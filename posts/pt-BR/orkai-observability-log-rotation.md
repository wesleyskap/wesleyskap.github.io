---
title: "Escrita Eficiente em Disco: Criando um Log File Rotation Writer Sem Bibliotecas Externas"
excerpt: "Gravar logs em arquivos de forma infinita satura o armazenamento em disco de servidores. Aprenda a projetar um rotacionador de arquivos de log concorrente e seguro em Go."
category: "Alta Performance"
date: "25 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Risco Oculto de Arquivos de Log Infinitos

Gravar os logs de execução da sua aplicação em arquivos locais é um padrão clássico na infraestrutura tradicional. No entanto, se sua API estiver processando milhares de requisições por minuto, o arquivo de logs crescerá rapidamente. Em poucas semanas, ele consumirá dezenas de gigabytes, esgotando o armazenamento em disco do seu servidor e causando falhas catastróficas na aplicação (como a incapacidade de salvar dados em disco).

Para evitar isso, as aplicações corporativas utilizam **File Rotation (Rotação de Arquivos)**, dividindo as escritas em múltiplos arquivos de tamanho limitado e descartando os mais antigos automaticamente.

O **orkai-observability** implementa um motor de escrita rotativa concorrente, seguro e leve em Go sem nenhuma dependência de bibliotecas de terceiros.

## Projetando o RotatingFileWriter

O `RotatingFileWriter` gerencia o arquivo atual sob travas exclusivas (`sync.Mutex`) e calcula dinamicamente os tamanhos físicos dos arquivos a cada nova escrita para realizar o chaveamento do arquivo quando o limite de bytes configurado for ultrapassado:

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
	maxSize     int64 // Tamanho máximo do arquivo em bytes (ex: 10 * 1024 * 1024 para 10MB)
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

## A Lógica Concorrente de Rotação

Quando gravamos novos bytes e o tamanho de `currentSize` ultrapassa o `maxSize`, fechamos o arquivo ativo, renomeamos o arquivo antigo adicionando um carimbo de data/hora (Timestamp) ao seu nome e abrimos um novo arquivo de logs limpo:

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

	// Cria o nome do arquivo rotacionado
	backupName := fmt.Sprintf("%s.%d.log", w.filename, time.Now().UnixNano())
	if err := os.Rename(w.filename, backupName); err != nil {
		return err
	}

	return w.openNew()
}
```

### Termos Técnicos Desmistificados
- **Log Rotation:** A ação de renomear e arquivar arquivos de log antigos quando eles atingem determinados critérios de tempo ou tamanho físico em disco.
- **Mutex (Mutual Exclusion):** Mecanismo de sincronização usado em concorrência para garantir que apenas uma goroutine possa ler ou escrever em um recurso por vez.
- **Timestamp:** Representação numérica ou textual que registra a data e hora exatas de um evento ou arquivo.
