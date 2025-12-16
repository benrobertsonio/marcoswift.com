import type { APIRoute } from 'astro';
import { neon } from '@netlify/neon';
import { Resend } from 'resend';

export const prerender = false;

const RATE_LIMIT_MAX = 5; // max attempts
const RATE_LIMIT_WINDOW_HOURS = 1; // per hour

export const POST: APIRoute = async ({ request, clientAddress }) => {
    try {
        const formData = await request.formData();
        const email = formData.get('email')?.toString().trim().toLowerCase();
        const honeypot = formData.get('website')?.toString();

        // honeypot check
        if (honeypot) {
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // basic email validation
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return new Response(JSON.stringify({ error: 'Invalid email address' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const sql = neon();
        const ip = clientAddress || request.headers.get('x-forwarded-for') || 'unknown';

        // create tables if they don't exist
        await sql`
            CREATE TABLE IF NOT EXISTS prologue_subscribers (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                ip_address TEXT,
                subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // add ip_address column if it doesn't exist (for existing tables)
        await sql`
            ALTER TABLE prologue_subscribers 
            ADD COLUMN IF NOT EXISTS ip_address TEXT
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS rate_limits (
                id SERIAL PRIMARY KEY,
                ip_address TEXT NOT NULL,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // check rate limit
        const rateLimitCheck = await sql`
            SELECT COUNT(*) as count FROM rate_limits 
            WHERE ip_address = ${ip} 
            AND attempted_at > NOW() - INTERVAL '1 hour'
        `;

        if (parseInt(rateLimitCheck[0].count) >= RATE_LIMIT_MAX) {
            return new Response(JSON.stringify({ error: 'Too many attempts. Please try again later.' }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // record this attempt
        await sql`INSERT INTO rate_limits (ip_address) VALUES (${ip})`;

        // clean up old rate limit records (older than 24 hours)
        await sql`DELETE FROM rate_limits WHERE attempted_at < NOW() - INTERVAL '24 hours'`;

        // insert email
        const result = await sql`
            INSERT INTO prologue_subscribers (email, ip_address)
            VALUES (${email}, ${ip})
            ON CONFLICT (email) DO NOTHING
            RETURNING id
        `;

        // only send notification if this is a new subscriber
        console.log('Insert result:', result);
        console.log('RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);

        if (result.length > 0 && process.env.RESEND_API_KEY) {
            console.log('Sending email notification...');
            const resend = new Resend(process.env.RESEND_API_KEY);

            try {
                const emailResult = await resend.emails.send({
                    from: 'marcoswift.com <noreply@marcoswift.com>',
                    to: 'decunningham@marcoswift.com',
                    subject: '📚 New Prologue Download!',
                    html: `
                        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #fdfbf7; border-radius: 8px;">
                            <div style="text-align: center; margin-bottom: 24px;">
                                <p style="color: #666; margin: 0 0 8px 0;">Hey David! 👋</p>
                                <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">You've Got a New Reader!</h1>
                                <p style="color: #666; margin-top: 8px;">Someone just grabbed the prologue to Marco Swift and the Mirror of Souls</p>
                            </div>
                            
                            <div style="background: white; padding: 20px; border-radius: 6px; border: 1px solid #e5e5e5;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #888; font-size: 14px;">Email</td>
                                        <td style="padding: 8px 0; color: #1a1a1a; font-weight: bold; text-align: right;">
                                            <a href="mailto:${email}" style="color: #1a1a1a;">${email}</a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #888; font-size: 14px; border-top: 1px solid #eee;">Time</td>
                                        <td style="padding: 8px 0; color: #1a1a1a; text-align: right; border-top: 1px solid #eee;">
                                            ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #888; font-size: 14px; border-top: 1px solid #eee;">Format</td>
                                        <td style="padding: 8px 0; color: #1a1a1a; text-align: right; border-top: 1px solid #eee;">
                                            Audiobook, ePub, PDF
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            
                            <p style="color: #888; font-size: 12px; text-align: center; margin-top: 24px;">
                                Marco Swift and the Mirror of Souls
                            </p>
                        </div>
                    `,
                });
                console.log('Email sent:', emailResult);
            } catch (emailError) {
                console.error('Email send failed:', emailError);
            }
        } else {
            console.log('Skipping email:', result.length === 0 ? 'duplicate email' : 'no API key');
        }

        return new Response(JSON.stringify({ success: true, redirect: '/download' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        return new Response(JSON.stringify({ error: 'Something went wrong' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
