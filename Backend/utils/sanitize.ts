/**
 * Remove HTML tags from user-supplied text before persisting it.
 * Defense-in-depth against stored XSS — render paths should still escape output.
 */
export function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, "");
}
