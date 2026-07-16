---
title: "99 Bottles of OOP: The Secret to Fearless Refactoring"
excerpt: "How do you refactor without breaking the system? Learn Sandi Metz's fundamental techniques based on 'Shameless Green', microscopic steps, and the Flocking Rules."
category: "Design Patterns"
date: "July 16, 2026"
readTime: "8 min read"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## The art of small steps

Many software engineers fail at refactoring because they attempt to rewrite large blocks of code all at once. The result? A sea of broken red tests and pure frustration.

In the book *99 Bottles of OOP*, Sandi Metz teaches that successful refactoring relies on **microscopic, reversible steps**, keeping the code green at every stage. The golden rule is simple: **never write new code while refactoring, and never refactor while writing new code**.

---

## First step: \"Shameless Green\"

Before discussing design patterns and refined abstractions, Sandi Metz introduces the concept of **Shameless Green**. The idea is to write the fastest, simplest, and most straightforward code possible (even if it looks "ugly" or contains obvious duplication) just to get all tests passing green.

The greatest design error is trying to anticipate abstractions and creating polymorphism or inheritance before you have enough empirical data about the actual variations in behavior. "Shameless Green" is your safe starting point:

```ruby
# Shameless Green: Direct, duplicated code, but passing tests
class SongVerse
  def lyrics(number)
    if number.zero?
      "No more bottles of beer on the wall."
    elsif number == 1
      "1 bottle of beer on the wall."
    else
      "#{number} bottles of beer on the wall."
    end
  end
end
```

---

## The cycle of safe refactoring

With the tests green, we follow the strict cycle of step-by-step refactoring:
1. **Identify the smallest point of duplication or poor design**.
2. **Make the simplest change possible** (microscopic step).
3. **Run the tests immediately**. If they pass, move forward; if they fail, revert immediately.

---

## Applying the flocking rules

To turn our "Shameless Green" code into an elegant polymorphic design without guesswork, we apply the **Flocking Rules** proposed by Sandi:

1. **Select the conditionals that look similar**.
2. **Identify the smallest difference between them**.
3. **Make a structural change to make the branches identical** (e.g., parameterizing the varying value).
4. **Extract the common code into a new polymorphic class or method** only when the conditionals are structurally identical.

```ruby
# Applying the Flocking Rules: Extracting polymorphic classes structurally
class BottleNumber
  def self.for(number)
    return BottleNumberZero.new if number.zero?
    return BottleNumberOne.new if number == 1

    new(number)
  end

  def initialize(number)
    @number = number
  end

  def quantity
    @number
  end
end

class BottleNumberZero < BottleNumber
  def quantity
    "no more"
  end
end

class BottleNumberOne < BottleNumber
  def quantity
    "1"
  end
end
```

### The result

By extracting variant logic into dedicated classes (`BottleNumberZero`, `BottleNumberOne`), the main song flow is freed from complex conditionals. If a new requirement arises tomorrow (e.g., "custom behavior for the number 6"), you only need to add a new class without altering or risking existing logic.
