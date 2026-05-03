#!/usr/bin/env python3
"""Transform a Supabase migrations bundle into something safe to re-run.

For every CREATE POLICY / TRIGGER / FUNCTION it prepends an idempotent DROP.
"""
import re
import sys

src = open(sys.argv[1]).read()

# 1) CREATE POLICY "name" ... ON [schema.]table  →  DROP+CREATE
policy_re = re.compile(
    r'CREATE\s+POLICY\s+("(?:[^"]|"")+")\s+ON\s+([A-Za-z0-9_."]+)',
    re.IGNORECASE,
)
src = policy_re.sub(
    lambda m: f'DROP POLICY IF EXISTS {m.group(1)} ON {m.group(2)};\nCREATE POLICY {m.group(1)} ON {m.group(2)}',
    src,
)

# 2) CREATE TRIGGER name ... ON [schema.]table  →  DROP+CREATE
trigger_re = re.compile(
    r'CREATE\s+TRIGGER\s+([A-Za-z0-9_]+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF).*?ON\s+([A-Za-z0-9_."]+)',
    re.IGNORECASE | re.DOTALL,
)
src = trigger_re.sub(
    lambda m: f'DROP TRIGGER IF EXISTS {m.group(1)} ON {m.group(2)};\n{m.group(0)}',
    src,
)

# 3) CREATE [OR REPLACE] FUNCTION [schema.]name(args) → DROP all overloads + CREATE
def split_top_level_commas(s: str):
    depth = 0
    in_str = False
    str_ch = ''
    out, buf = [], []
    i = 0
    while i < len(s):
        ch = s[i]
        if in_str:
            buf.append(ch)
            if ch == str_ch:
                # handle doubled '' inside a string
                if i + 1 < len(s) and s[i + 1] == str_ch:
                    buf.append(s[i + 1])
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        if ch in ("'", '"'):
            in_str = True
            str_ch = ch
            buf.append(ch)
        elif ch in '([':
            depth += 1
            buf.append(ch)
        elif ch in ')]':
            depth -= 1
            buf.append(ch)
        elif ch == ',' and depth == 0:
            out.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    if buf:
        out.append(''.join(buf).strip())
    return [x for x in out if x]

def extract_arg_types(arg_block: str) -> str:
    """Given the body inside (...) of a function declaration, return the
    type-only signature: '(uuid, text, jsonb)'. Strips arg names, IN/OUT,
    and DEFAULT clauses."""
    if arg_block.strip() == '':
        return '()'
    args = split_top_level_commas(arg_block)
    types = []
    for a in args:
        # strip DEFAULT ...
        a = re.split(r'\bDEFAULT\b', a, flags=re.IGNORECASE)[0].strip()
        # OUT params don't count toward signature; skip them
        if re.match(r'^\s*OUT\b', a, re.IGNORECASE):
            continue
        # remove leading IN/INOUT/VARIADIC
        a = re.sub(r'^(IN|INOUT|VARIADIC)\s+', '', a, flags=re.IGNORECASE).strip()
        # arg might be "name type" or just "type". If first token is an identifier
        # AND the remaining is a known type pattern, drop the first token.
        tokens = a.split(None, 1)
        if len(tokens) == 2:
            # heuristic: if the remaining starts with another identifier, treat
            # the first as a name. Always treat 2-token form as name+type.
            types.append(tokens[1].strip())
        else:
            types.append(a)
    return '(' + ', '.join(types) + ')'

def find_matching_paren(s: str, open_idx: int) -> int:
    depth = 0
    in_str = False
    str_ch = ''
    i = open_idx
    while i < len(s):
        ch = s[i]
        if in_str:
            if ch == str_ch:
                if i + 1 < len(s) and s[i + 1] == str_ch:
                    i += 2
                    continue
                in_str = False
        elif ch in ("'", '"'):
            in_str = True
            str_ch = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1

func_re = re.compile(
    r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z0-9_."]+)\s*\(',
    re.IGNORECASE,
)

result = []
pos = 0
for m in func_re.finditer(src):
    name = m.group(1)
    open_paren = m.end() - 1
    close_paren = find_matching_paren(src, open_paren)
    if close_paren < 0:
        continue
    args_body = src[open_paren + 1:close_paren]
    sig = extract_arg_types(args_body)

    result.append(src[pos:m.start()])
    result.append(f'DROP FUNCTION IF EXISTS {name}{sig} CASCADE;\n')
    result.append('CREATE OR REPLACE FUNCTION ')
    result.append(f'{name}({args_body})')
    pos = close_paren + 1

result.append(src[pos:])
src = ''.join(result)

# Clean up potential double-OR-REPLACE
src = re.sub(
    r'CREATE\s+OR\s+REPLACE\s+OR\s+REPLACE\s+FUNCTION',
    'CREATE OR REPLACE FUNCTION',
    src,
    flags=re.IGNORECASE,
)

sys.stdout.write(src)
