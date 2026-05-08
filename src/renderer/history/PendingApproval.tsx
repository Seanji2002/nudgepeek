import React from 'react'
import styles from './Login.module.css'

interface Props {
  onSignOut: () => void | Promise<void>
}

export default function PendingApproval({ onSignOut }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoMark}>N</div>
        <h1 className={styles.title}>Awaiting approval</h1>
        <p className={styles.bodyText}>
          Your account has been created. An admin needs to approve it before you can see photos.
          Sign in again once they let you know.
        </p>
        <button type="button" className={styles.secondaryBtn} onClick={() => void onSignOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
