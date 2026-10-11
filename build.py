"""Assemble index.html from src/ (template + data + checker + game UI).
Run from the project root:  python3 build.py
"""
import os
root = os.path.dirname(os.path.abspath(__file__))
src = lambda f: open(os.path.join(root, 'src', f), encoding='utf-8').read()
html = (src('template.html')
        .replace('/*DATA*/', src('data.js'))
        .replace('/*CORE*/', src('core.js'))
        .replace('/*APP*/', src('app.js')))
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(html)
print('built index.html')
