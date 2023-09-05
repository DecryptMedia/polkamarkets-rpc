import * as yup from 'yup';

export const eventsSchema = yup.object({
  contract: yup
    .mixed()
    .oneOf(['predictionMarket', 'predictionMarketV2', 'erc20', 'realitio', 'achievements', 'voting', 'reward', 'merkleDistributor'])
    .required('Contract is required!'),
  eventName: yup.string().required('Event name is required!'),
  address: yup.string().required('Address is required!')
});
