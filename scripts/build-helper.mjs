// Собирает helper\TunnelyHelper.cs встроенным в Windows компилятором C# (.NET Framework 4).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const csc = join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
if (!existsSync(csc)) throw new Error('Не найден компилятор C# из .NET Framework 4')

const out = join(root, 'resources', 'core')
mkdirSync(out, { recursive: true })
execFileSync(csc, [
  '/nologo', '/optimize+', '/target:exe', '/platform:anycpu',
  `/out:${join(out, 'tunnely-helper.exe')}`,
  join(root, 'helper', 'TunnelyHelper.cs')
], { stdio: 'inherit' })
console.log('Готово: resources/core/tunnely-helper.exe')
