/** Фон всего сайта: медленно дрейфующее сияние, точечная сетка и плёночное зерно. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
      <div className="dots" />
    </div>
  )
}
