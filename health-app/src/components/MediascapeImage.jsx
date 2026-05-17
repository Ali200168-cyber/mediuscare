/**
 * Optimized decorative or informative image for MediusCare screens.
 */
export default function MediascapeImage({
  src,
  alt,
  className = "",
  decorative = false,
  priority = false,
  sizes,
}) {
  const common = {
    className,
    src,
    decoding: "async",
    loading: priority ? "eager" : "lazy",
    ...(priority ? { fetchPriority: "high" } : {}),
    ...(sizes ? { sizes } : {}),
  };

  if (decorative) {
    return <img {...common} alt="" role="presentation" aria-hidden="true" />;
  }

  return <img {...common} alt={alt} />;
}
