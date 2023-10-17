'use client'
import React from 'react'
import { Button } from './ui/button';
import toast from 'react-hot-toast';
import axios from 'axios';

type Props = {isPro: Boolean}

const SubscriptionButton = (props: Props) => {

    const [loading, setLoading] = React.useState(false);
    const handleSubscriptions = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/stripe');
            window.location.href = response.data.url;

        } catch (error) {
            console.error(error);
            toast.error('stripe connection failed');
        } finally{
            setLoading(false);
        }
    }

    return (
        <Button disabled={loading} onClick={handleSubscriptions}>
            {
                props.isPro ? 'Manage Subscriptions' : 'Get Pro!'
            }
        </Button>
    )
}

export default SubscriptionButton