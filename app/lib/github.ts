/**
 * GitHub API utilities for the places gazetteer.
 * Handles OAuth token exchange and file operations via the GitHub Contents API.
 */

const GITHUB_API = 'https://api.github.com';

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

/** Exchange an OAuth code for an access token. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error_description || data.error}`,
    );
  }
  return data.access_token;
}

/** Get the authenticated GitHub user. */
export async function getGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub user');
  return res.json();
}

/** Check if the user has push access to the repo. */
export async function hasRepoAccess(token: string): Promise<boolean> {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  if (!owner || !repo) return false;

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.permissions?.push === true;
}

/** Read a file from the repo. Returns content + sha for updates.
 *  Falls back to the Git Blobs API for files >1 MB where the
 *  Contents API omits the file content. */
export async function readRepoFile(
  token: string,
  path: string,
): Promise<{ content: string; sha: string }> {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_REPO_BRANCH || 'main';

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status}`);
  const data = await res.json();

  // The Contents API omits `content` for files >1 MB.
  // Fall back to the Blobs API which supports up to 100 MB.
  if (data.content) {
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha };
  }

  const blobRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${data.sha}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!blobRes.ok)
    throw new Error(`Failed to read blob for ${path}: ${blobRes.status}`);
  const blob = await blobRes.json();
  const content = Buffer.from(blob.content, 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

/** Write (create or update) a file in the repo.
 *  Uses the Git Data API (blob → tree → commit → ref) to support
 *  files larger than the 1 MB Contents API limit. */
export async function writeRepoFile(
  token: string,
  path: string,
  content: string,
  sha: string | null,
  message: string,
): Promise<void> {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_REPO_BRANCH || 'main';
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1. Create a blob with the file content
  const blobRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
      }),
    },
  );
  if (!blobRes.ok) {
    const err = await blobRes.text();
    throw new Error(
      `Failed to create blob for ${path}: ${blobRes.status} ${err}`,
    );
  }
  const blob = await blobRes.json();

  // 2. Get the current branch tip commit
  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { headers },
  );
  if (!refRes.ok) {
    throw new Error(`Failed to get ref heads/${branch}: ${refRes.status}`);
  }
  const ref = await refRes.json();
  const parentCommitSha: string = ref.object.sha;

  // 3. Get the tree SHA from the parent commit
  const commitRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${parentCommitSha}`,
    { headers },
  );
  if (!commitRes.ok) {
    throw new Error(
      `Failed to get commit ${parentCommitSha}: ${commitRes.status}`,
    );
  }
  const parentCommit = await commitRes.json();

  // 4. Create a new tree with the updated file
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: parentCommit.tree.sha,
        tree: [
          {
            path,
            mode: '100644',
            type: 'blob',
            sha: blob.sha,
          },
        ],
      }),
    },
  );
  if (!treeRes.ok) {
    const err = await treeRes.text();
    throw new Error(
      `Failed to create tree for ${path}: ${treeRes.status} ${err}`,
    );
  }
  const tree = await treeRes.json();

  // 5. Create the commit
  const newCommitRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [parentCommitSha],
      }),
    },
  );
  if (!newCommitRes.ok) {
    const err = await newCommitRes.text();
    throw new Error(`Failed to create commit: ${newCommitRes.status} ${err}`);
  }
  const newCommit = await newCommitRes.json();

  // 6. Update the branch ref to point to the new commit
  const updateRefRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: newCommit.sha }),
    },
  );
  if (!updateRefRes.ok) {
    const err = await updateRefRes.text();
    throw new Error(
      `Failed to update ref heads/${branch}: ${updateRefRes.status} ${err}`,
    );
  }
}
